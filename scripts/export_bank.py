"""Export the upstream v0.1.2 SQLite question bank for static hosting."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3

parser = argparse.ArgumentParser()
parser.add_argument("database", type=Path)
args = parser.parse_args()
if hashlib.sha256(args.database.read_bytes()).hexdigest() != "ed03a6709a2f0ca83c3b7e0c967246fa7646c0d6bbc941efbfb8944fafce8f4c":
    parser.error("Expected the original build/bank.db from zx-study v0.1.2")

output = Path(__file__).resolve().parents[1] / "docs" / "data"
output.mkdir(exist_ok=True)
db = sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True)
db.row_factory = sqlite3.Row
summary = {}
for subject in db.execute("select id, name from subject order by id"):
    for grade in range(1, 7):
        key = f"{subject['id']}-{grade}"
        questions = []
        for row in db.execute("""
            select q.id, q.type, q.stem, q.options, q.answer, q.solution,
                   q.difficulty, k.name as topic
            from question q left join knowledge_point k on q.knowledge_id = k.id
            where q.subject_id = ? and q.grade = ? order by q.id
        """, (subject["id"], grade)):
            question = dict(row)
            for field in ("options", "answer"):
                if question[field] is not None:
                    question[field] = json.loads(question[field])
            questions.append({k: v for k, v in question.items() if v is not None})
        summary[key] = len(questions)
        # Classic scripts also work in the downloadable, offline copy.
        blob = json.dumps(questions, ensure_ascii=False, separators=(",", ":"))
        (output / f"{key}.js").write_text(f'window.studyBank.set("{key}",{blob});\n', encoding="utf-8")
(output / "index.js").write_text("window.bankCounts = " + json.dumps(summary) + ";\n", encoding="utf-8")
print(f"{len(summary)} subject/grade groups, {sum(summary.values())} questions")
