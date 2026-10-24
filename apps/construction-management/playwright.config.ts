import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { defineConfig, devices } from "@playwright/test";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * End-to-end tests (ADR CM-0031) run against a production build
 * (`bun run test:e2e:build`) served by `next start`, with the environment in
 * `e2e/e2e.env`. Every test arranges its own Company through the real API, so
 * tests never share data and run in parallel.
 *
 * PR and merge runs: `bun run test:e2e:pr` (the `@pr` tag, at most 40 tests).
 * Nightly: `bun run test:e2e` (everything).
 */
export const e2eEnv = parseEnv(
  readFileSync(path.join(dirname, "e2e/e2e.env"), "utf8"),
) as Record<string, string>;

const APP_ORIGIN = e2eEnv["BETTER_AUTH_URL"] ?? "http://localhost:3102";
// GitHub Actions sets CI; it changes how tests run, not what is built.
// eslint-disable-next-line turbo/no-undeclared-env-vars
const CI = process.env["CI"] != null && process.env["CI"] !== "";
const PORT = new URL(APP_ORIGIN).port;

export default defineConfig({
  testDir: "./e2e/specs",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: CI,
  /* Retry on CI only */
  retries: CI ? 1 : 0,
  /* Two workers locally keep the laptop responsive next to `next start`. */
  workers: CI ? 4 : 2,
  /* Hard ceiling so a hung run never blocks the pipeline indefinitely. */
  globalTimeout: CI ? 30 * 60 * 1000 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: APP_ORIGIN,
    /* Collect trace when retrying the failed test. */
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
    /* GSAP and popup animations raced Storybook tests; the app honours this. */
    contextOptions: { reducedMotion: "reduce" },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    /* Site staff use phones: the `@mobile` tests also run on a phone viewport. */
    {
      name: "mobile",
      grep: /@mobile/,
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: `node_modules/.bin/next start --port ${PORT}`,
    env: e2eEnv,
    url: `${APP_ORIGIN}/sign-in`,
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: "pipe",
  },
});
