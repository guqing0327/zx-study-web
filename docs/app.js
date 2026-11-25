"use strict";
window.studyBank = new Map();
const groupsLoading = new Map();
const $ = (selector, parent = document) => parent.querySelector(selector);
const subjects = { 1: "语文", 2: "数学", 3: "英语" };
const grades = ["", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级"];
const types = {
  single: "单选题",
  multiple: "多选题",
  judge: "判断题",
  fill: "填空题",
  cloze: "补全题",
  calculation: "计算题",
  pinyin_word: "看拼音写词语",
  short_answer: "简答题",
  sorting: "排序题",
  matching: "配对题",
};
const wrongKey = "zx-study-web.wrong.v1";
let screen = "home",
  filterVersion = 0,
  navVersion = 0;
let session = null,
  paper = null;
function node(tag, cls, text) {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text != null) element.textContent = text;
  return element;
}
function mathText(value) {
  const span = node("span");
  const valueText = String(value ?? "").replace(/\\\\([A-Za-z]+)/g, "\\$1");
  for (const part of valueText.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)) {
    if (
      part.startsWith("$") &&
      part.endsWith("$") &&
      part.length > 1 &&
      window.katex
    ) {
      const formula = part.startsWith("$$")
        ? part.slice(2, -2)
        : part.slice(1, -1);
      const rendered = node("span");
      katex.render(formula.replace(/\\textasciitilde/g, "~"), rendered, {
        output: "mathml",
        throwOnError: false,
        trust: false,
      });
      span.append(rendered);
    } else {
      span.append(
        document.createTextNode(
          part
            .replace(/\\(?:textbf|uline)\{([^{}]*)\}/g, "$1")
            .replace(/\\([#_])/g, "$1")
            .replace(/\\ldots\b/g, "…"),
        ),
      );
    }
  }
  return span;
}
function button(text, action, cls) {
  const b = node("button", cls, text);
  b.type = "button";
  b.onclick = action;
  return b;
}
function notice(text = "") {
  $("#notice").textContent = text;
}
function currentKey() {
  return $("input[name=subject]:checked").value + "-" + $("#grade").value;
}
function titleFor(key) {
  const [s, g] = key.split("-");
  return grades[g] + subjects[s];
}
function readWrong() {
  try {
    return JSON.parse(localStorage.getItem(wrongKey) || "{}") || {};
  } catch {
    return {};
  }
}
let wrong = readWrong();
function updateBadge() {
  $("#wrong-count").textContent = Object.keys(wrong).length;
}
function saveResult(q, key, correct) {
  if (correct === null) return;
  try {
    const saved = readWrong();
    if (correct) delete saved[q.id];
    else saved[q.id] = { key, title: q.stem.slice(0, 140), time: Date.now() };
    localStorage.setItem(wrongKey, JSON.stringify(saved));
    wrong = saved;
  } catch {
    if (!correct)
      wrong[q.id] = { key, title: q.stem.slice(0, 140), time: Date.now() };
    else delete wrong[q.id];
    notice("浏览器未能保存错题，当前页面仍可继续练习。");
  }
  updateBadge();
}
window.addEventListener("storage", (event) => {
  if (event.key === wrongKey || event.key === null) {
    wrong = readWrong();
    updateBadge();
    if (screen === "wrong") showWrong();
  }
});
async function loadGroup(key) {
  if (studyBank.has(key)) return studyBank.get(key);
  if (!Object.hasOwn(bankCounts, key)) throw Error("未知的年级或科目");
  if (!groupsLoading.has(key)) {
    const task = new Promise((resolve, reject) => {
      const script = node("script");
      script.src = "./data/" + key + ".js";
      script.onload = () => {
        script.remove();
        if (studyBank.has(key)) resolve(studyBank.get(key));
        else reject(Error("题库数据不完整"));
      };
      script.onerror = () => {
        script.remove();
        reject(Error("题库加载失败，请检查网络并重试。"));
      };
      document.head.append(script);
    }).finally(() => groupsLoading.delete(key));
    groupsLoading.set(key, task);
  }
  return groupsLoading.get(key);
}
function sample(rows, limit) {
  const out = rows.slice();
  const count = Math.min(limit, out.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (out.length - i));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, count);
}
function show(id) {
  navVersion++;
  screen = id;
  for (const s of document.querySelectorAll("main > section"))
    s.hidden = s.id !== id;
  for (const b of document.querySelectorAll("nav button")) {
    if (b.dataset.nav === (id === "wrong" ? "wrong" : "home"))
      b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  }
  notice();
  window.scrollTo(0, 0);
}
async function refreshFilters() {
  const version = ++filterVersion;
  const key = currentKey();
  const select = $("#type");
  const prior = select.value;
  $("#start").disabled = $("#paper").disabled = true;
  $("#pool").textContent = "正在载入" + titleFor(key) + "题库…";
  try {
    const rows = await loadGroup(key);
    if (version !== filterVersion) return;
    const options = new Set(rows.map((q) => q.type));
    select.replaceChildren(new Option("全部题型", ""));
    for (const [id, label] of Object.entries(types))
      if (options.has(id)) select.add(new Option(label, id));
    select.value = options.has(prior) ? prior : "";
    updatePool();
  } catch (error) {
    if (version !== filterVersion) return;
    $("#pool").replaceChildren(
      error.message + " ",
      button("重试", refreshFilters),
    );
  }
}
function filtered() {
  const kind = $("#type").value;
  return (studyBank.get(currentKey()) || []).filter(
    (q) => !kind || q.type === kind,
  );
}
function updatePool() {
  const count = filtered().length;
  $("#pool").textContent =
    titleFor(currentKey()) +
    " · 当前可选 " +
    count.toLocaleString("zh-CN") +
    " 道题";
  $("#start").disabled = $("#paper").disabled = !count;
}
function draw() {
  return sample(filtered(), Number($("#size").value)).map((q) => ({
    q,
    key: currentKey(),
  }));
}
function startSession(items, name) {
  if (!items.length) return;
  session = { items, name, index: 0, responses: [] };
  show("practice");
  renderQuestion();
}
function printableOptions(q) {
  if (q.type === "matching")
    return [
      "左栏：" + q.options.left.join("、"),
      "右栏：" + q.options.right.join("、"),
    ];
  if (q.type === "pinyin_word")
    return q.options.words.map((w) => w.pinyin.join(" "));
  if (!Array.isArray(q.options)) return [];
  return q.options.map((o, i) =>
    q.type === "sorting" ? String(o) : String.fromCharCode(65 + i) + ". " + o,
  );
}
function answerText(q, value = q.answer) {
  if (value == null) return "";
  if (q.type === "single" || q.type === "judge")
    return String(q.options[Number(value)] ?? value);
  if (q.type === "multiple") return value.map((i) => q.options[i]).join("、");
  if (q.type === "matching")
    return Object.entries(value)
      .map(([i, v]) => q.options.left[i] + " — " + v)
      .join("；");
  if (q.type === "short_answer" && typeof value === "object")
    return String(value.reference || (value.keywords || []).join("、"));
  if (Array.isArray(value))
    return value.join(q.type === "sorting" ? " → " : "；");
  return String(value);
}
function makeInput(q, area) {
  if (["single", "judge", "multiple"].includes(q.type)) {
    area.className = "options";
    q.options.forEach((value, i) => {
      const label = node("label", "option");
      const input = node("input");
      input.type = q.type === "multiple" ? "checkbox" : "radio";
      input.name = "choice";
      input.value = i;
      label.append(input, mathText(String.fromCharCode(65 + i) + ". " + value));
      area.append(label);
    });
    return () => {
      const chosen = [...area.querySelectorAll("input:checked")].map((el) =>
        Number(el.value),
      );
      return chosen.length
        ? q.type === "multiple"
          ? chosen
          : chosen[0]
        : undefined;
    };
  }
  if (q.type === "matching") {
    q.options.left.forEach((left, i) => {
      const label = node("label", "field");
      label.append(mathText(left));
      const select = node("select");
      select.add(new Option("选择对应项", ""));
      q.options.right.forEach((r, j) => select.add(new Option(r, String(j))));
      select.dataset.index = i;
      label.append(select);
      area.append(label);
    });
    return () => {
      const picks = [...area.querySelectorAll("select")];
      if (picks.some((el) => el.value === "")) return undefined;
      return Object.fromEntries(
        picks.map((el) => [
          el.dataset.index,
          q.options.right[Number(el.value)],
        ]),
      );
    };
  }
  if (q.type === "sorting") {
    const values = q.options.slice();
    const paint = () => {
      area.replaceChildren(node("span", "hint", "用上移、下移调整顺序。"));
      values.forEach((value, i) => {
        const row = node("div", "sort-item");
        const move = (delta) => {
          [values[i], values[i + delta]] = [values[i + delta], values[i]];
          paint();
        };
        const up = button("上移", () => move(-1)),
          down = button("下移", () => move(1));
        up.disabled = i === 0;
        down.disabled = i === values.length - 1;
        row.append(mathText(i + 1 + ". " + value), up, down);
        area.append(row);
      });
    };
    paint();
    return () => values.slice();
  }
  const blanks = ["fill", "cloze", "pinyin_word"].includes(q.type);
  const count = blanks && Array.isArray(q.answer) ? q.answer.length : 1;
  for (let i = 0; i < count; i++) {
    const label = node("label", "field");
    const pinyin =
      q.type === "pinyin_word" ? q.options.words[i]?.pinyin?.join(" ") : "";
    label.append(pinyin || (count > 1 ? "第 " + (i + 1) + " 空" : "你的答案"));
    const input = node(q.type === "short_answer" ? "textarea" : "input");
    if (input.tagName === "INPUT") input.type = "text";
    else input.rows = 3;
    input.autocomplete = "off";
    label.append(input);
    area.append(label);
  }
  return () => {
    const vals = [...area.querySelectorAll("input,textarea")].map((el) =>
      el.value.trim(),
    );
    if (!vals.length || vals.some((v) => !v)) return undefined;
    return blanks ? vals : vals[0];
  };
}
function renderQuestion() {
  const { items, index, responses } = session,
    { q, key } = items[index];
  const panel = $("#question-panel");
  panel.replaceChildren(
    node(
      "p",
      "sub",
      session.name + " · 第 " + (index + 1) + " / " + items.length + " 题",
    ),
  );
  const progress = node("div", "progress"),
    fill = node("i");
  fill.style.width = (100 * index) / items.length + "%";
  progress.append(fill);
  const card = node("div", "card");
  panel.append(progress, card);
  card.append(
    node(
      "p",
      "sub",
      [titleFor(key), types[q.type], q.topic].filter(Boolean).join(" · "),
    ),
  );
  const h = node("h1", "stem");
  h.append(mathText(q.stem));
  card.append(h);
  const area = node("fieldset", "fields");
  area.setAttribute("aria-label", "作答");
  card.append(area);
  const getAnswer = makeInput(q, area);
  const actions = node("div", "actions");
  const submit = button(
    "提交答案",
    () => {
      const actual = getAnswer();
      if (actual === undefined) {
        notice("请先完成本题再提交。");
        return;
      }
      notice();
      const kind = q.type === "pinyin_word" ? "fill" : q.type;
      const outcome = scoreAnswer(kind, q.answer, actual, 1).isCorrect;
      responses.push(outcome);
      area.disabled = true;
      saveResult(q, key, outcome);
      const feedback = node(
        "div",
        "feedback" + (outcome === false ? " bad" : ""),
      );
      feedback.setAttribute("role", "status");
      feedback.append(
        node(
          "strong",
          "",
          outcome === true
            ? "答对了"
            : outcome === false
              ? "已加入错题本"
              : "请对照参考答案自评",
        ),
      );
      if (outcome !== true || q.solution) {
        const reference = node("p");
        reference.append("参考答案：", mathText(answerText(q)));
        feedback.append(reference);
      }
      if (q.solution) {
        const p = node("p");
        p.append(mathText(q.solution));
        feedback.append(p);
      }
      card.insertBefore(feedback, actions);
      const next = button(
        index + 1 === items.length ? "查看结果" : "下一题",
        () => {
          if (index + 1 === items.length) showResult();
          else {
            session.index++;
            renderQuestion();
            window.scrollTo(0, 0);
          }
        },
        "primary",
      );
      actions.replaceChildren(next);
      next.focus();
    },
    "primary",
  );
  actions.append(submit);
  card.append(actions);
}
function showResult() {
  show("results");
  const passed = session.responses.filter((x) => x === true).length;
  const review = session.items.filter(
    (item, i) => session.responses[i] === false,
  );
  const pending = session.responses.filter((x) => x === null).length;
  const panel = $("#result-panel"),
    actions = node("div", "actions");
  panel.replaceChildren(
    node("p", "sub", session.name),
    node("p", "metric", passed + " / " + session.items.length),
    node(
      "p",
      "meta",
      "答对 " +
        passed +
        " 题 · 答错 " +
        review.length +
        " 题" +
        (pending ? " · 待自评 " + pending + " 题" : ""),
    ),
  );
  if (review.length)
    actions.append(
      button("重做本组错题", () => startSession(review, "错题重做"), "primary"),
    );
  actions.append(
    button("再选一组", () => show("home")),
    button("打印这组题", () => showPaper(session.items, session.name)),
  );
  panel.append(actions);
}
function showWrong() {
  show("wrong");
  const panel = $("#wrong-panel");
  const entries = Object.entries(wrong).sort((a, b) => b[1].time - a[1].time);
  if (!entries.length) {
    panel.replaceChildren(
      node("h2", "", "还没有错题"),
      button("去练习", () => show("home"), "primary"),
    );
    return;
  }
  const retry = button(
    "重做错题（最多 20 道）",
    async () => {
      const version = navVersion;
      retry.disabled = true;
      try {
        const chosen = entries.slice(0, 20);
        const sets = new Map(
          await Promise.all(
            [...new Set(chosen.map(([, e]) => e.key))].map(async (k) => [
              k,
              await loadGroup(k),
            ]),
          ),
        );
        const items = chosen
          .map(([id, e]) => ({
            key: e.key,
            q: sets.get(e.key).find((q) => q.id === Number(id)),
          }))
          .filter((it) => it.q);
        if (version === navVersion && items.length)
          startSession(items, "错题重做");
      } catch (error) {
        if (version === navVersion) notice(error.message);
      } finally {
        retry.disabled = false;
      }
    },
    "primary",
  );
  panel.replaceChildren(
    node("h2", "wrong-summary", "待复习 " + entries.length + " 题"),
    retry,
  );
  const list = node("ul", "rows");
  for (const [, e] of entries.slice(0, 50)) {
    const li = node("li");
    li.append(node("p", "sub", titleFor(e.key)), mathText(e.title));
    list.append(li);
  }
  panel.append(list);
  if (entries.length > 50)
    panel.append(node("p", "meta", "这里显示最近的 50 道错题。"));
}
function showPaper(items, name) {
  if (!items.length) return;
  paper = { items, name };
  show("paper-view");
  renderPaper();
}
function renderPaper() {
  if (!paper) return;
  const sheet = $("#sheet");
  sheet.replaceChildren(
    node("h2", "paper-title", paper.name + "练习卷"),
    node(
      "p",
      "print-meta",
      "姓名 __________　 日期 __________　 共 " + paper.items.length + " 题",
    ),
  );
  const answers = node("div", "answerpage");
  answers.append(node("h2", "paper-title", "参考答案"));
  paper.items.forEach(({ q }, i) => {
    const row = node("div", "print-item");
    row.append(mathText(i + 1 + ". " + q.stem));
    const opts = printableOptions(q);
    if (opts.length) {
      const p = node("div", "paper-options");
      p.append(mathText(opts.join("　 ")));
      row.append(p);
    }
    row.append(node("div", "write-space"));
    sheet.append(row);
    const a = node("div", "print-item");
    a.append(mathText(i + 1 + ". " + answerText(q)));
    answers.append(a);
  });
  if ($("#include-answers").checked) sheet.append(answers);
}
for (const el of document.querySelectorAll("[data-nav]"))
  el.onclick = () => (el.dataset.nav === "wrong" ? showWrong() : show("home"));
for (const el of document.querySelectorAll("input[name=subject],#grade"))
  el.addEventListener("change", refreshFilters);
$("#type").onchange = updatePool;
$("#start").onclick = () => startSession(draw(), titleFor(currentKey()));
$("#paper").onclick = () => showPaper(draw(), titleFor(currentKey()));
$("#include-answers").onchange = renderPaper;
$("#print").onclick = () => window.print();
updateBadge();
refreshFilters();
