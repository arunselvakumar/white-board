import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Builds the app for end-to-end tests with `e2e/e2e.env` (into `.next-e2e`).
 * Next passes `node --env-file` on to its build workers, which refuse it, so
 * the environment is loaded here instead.
 */
const env = parseEnv(
  readFileSync(path.join(import.meta.dirname, "e2e.env"), "utf8"),
);
const result = spawnSync("node_modules/.bin/next", ["build", "--webpack"], {
  cwd: path.join(import.meta.dirname, ".."),
  env: { ...process.env, ...env },
  stdio: "inherit",
});
process.exit(result.status ?? 1);
