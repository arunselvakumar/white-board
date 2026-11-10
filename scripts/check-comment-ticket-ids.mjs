// Fails when a comment under an app's `app/` or `components/` carries a
// ticket ID (`CM-501`, `P0-002`). Tickets belong in the PR and commit
// message; comments say why the code is the way it is (AGENTS.md, Comments).
// ADR numbers have a leading zero (`ADR CM-0017`) and pass.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

const TICKET = /\bCM-[1-9][0-9]{2,}\b|\bP[0-9]-[0-9]{3}\b/;
const APPS = ["whiteboard", "construction-management"];

const files = execFileSync(
  "git",
  [
    "ls-files",
    ...APPS.flatMap((app) => [
      `apps/${app}/app/*.ts`,
      `apps/${app}/app/*.tsx`,
      `apps/${app}/components/*.ts`,
      `apps/${app}/components/*.tsx`,
    ]),
  ],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean);

const problems = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const seen = new Set();
  const check = (position) => {
    const ranges = [
      ...(ts.getLeadingCommentRanges(text, position) ?? []),
      ...(ts.getTrailingCommentRanges(text, position) ?? []),
    ];
    for (const range of ranges) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const comment = text.slice(range.pos, range.end);
      const match = TICKET.exec(comment);
      if (match) {
        const line = text.slice(0, range.pos).split("\n").length;
        problems.push(`${file}:${line}  ${match[0]}`);
      }
    }
  };
  const visit = (node) => {
    check(node.getFullStart());
    check(node.getEnd());
    // A JSX comment, `{/* ... */}`, is an expression container with no
    // expression; its comment sits inside the braces, where the walk above
    // does not look. Strings that merely look like one are not matched.
    if (ts.isJsxExpression(node) && node.expression == null) {
      const inner = text.slice(node.getStart(source) + 1, node.getEnd() - 1);
      const match = TICKET.exec(inner);
      if (match) {
        const line = text.slice(0, node.getStart(source)).split("\n").length;
        problems.push(`${file}:${line}  ${match[0]}`);
      }
    }
    node.forEachChild(visit);
  };
  visit(source);
}

if (problems.length > 0) {
  console.error(
    `Ticket IDs in comments (put them in the PR or commit message instead):\n${problems.join("\n")}`,
  );
  process.exit(1);
}
console.log(`No ticket IDs in comments (${files.length} files).`);
