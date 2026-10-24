import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * PR and merge runs take only the `@pr` tests (ADR CM-0031). The budget keeps
 * that run short: a new `@pr` test has to replace one, or the budget is
 * raised in the ADR first.
 */
const BUDGET = 40;

const listing = execFileSync(
  "node_modules/.bin/playwright",
  ["test", "--list", "--grep", "@pr", "--project", "chromium"],
  { cwd: path.join(import.meta.dirname, ".."), encoding: "utf8" },
);
const tests = listing.split("\n").filter((line) => line.includes(" › "));
process.stdout.write(
  `${String(tests.length)} @pr tests (budget ${String(BUDGET)}).\n`,
);
if (tests.length > BUDGET) {
  console.error(
    `Too many @pr tests: ${String(tests.length)} > ${String(BUDGET)}. Move one to nightly or raise the budget in ADR CM-0031.`,
  );
  process.exit(1);
}
