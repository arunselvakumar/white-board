import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { e2eEnv } from "../../playwright.config";

const DB_PACKAGE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/db/construction",
);

/**
 * Runs SQL on the end-to-end database. Only for what no API can arrange,
 * such as a plan that has already ended; everything else goes through the
 * app's own routes.
 */
export function executeSql(sql: string): void {
  const url = new URL(e2eEnv["DATABASE_URL"] ?? "");
  url.searchParams.delete("connection_limit");
  execFileSync(
    "bunx",
    ["prisma", "db", "execute", "--url", url.toString(), "--stdin"],
    {
      cwd: DB_PACKAGE,
      input: sql,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

/** Single-quotes a value for SQL. */
export function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
