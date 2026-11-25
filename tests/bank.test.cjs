const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../docs");
const window = { studyBank: new Map() };
const context = vm.createContext({ window });
function load(name) {
  vm.runInContext(fs.readFileSync(path.join(root, name), "utf8"), context, {
    filename: name,
  });
}

load("data/index.js");
load("scoring.js");

test("all eighteen original question groups have distinct IDs and the advertised size", () => {
  const ids = new Set();
  assert.equal(Object.keys(window.bankCounts).length, 18);
  for (const [key, count] of Object.entries(window.bankCounts)) {
    load("data/" + key + ".js");
    const rows = window.studyBank.get(key);
    assert.equal(rows.length, count);
    for (const q of rows) {
      assert.ok(
        !ids.has(q.id) && q.stem && q.answer != null,
        "invalid question " + q.id,
      );
      ids.add(q.id);
    }
  }
  assert.equal(ids.size, 74115);
});

test("original scoring preserves index zero, equivalent fractions, alternative answers and unordered multiple choice", () => {
  for (const [type, expected, answer, correct] of [
    ["single", 0, 0, true],
    ["judge", 0, 1, false],
    ["calculation", 0.5, "1/2", true],
    ["fill", ["清晨|早上"], ["早上"], true],
    ["multiple", [0, 2], [2, 0], true],
    ["multiple", [0, 2], [0], false],
    ["sorting", ["A", "B"], ["B", "A"], false],
    ["matching", { 0: "春" }, { 0: "春" }, true],
    ["short_answer", { reference: "示例", keywords: [] }, "示例", null],
  ]) {
    assert.equal(
      window.scoreAnswer(type, expected, answer, 1).isCorrect,
      correct,
    );
  }
});
