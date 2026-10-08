import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const alias = { "@": dirname };

const TEST_DATABASE_URL =
  process.env["CONSTRUCTION_DATABASE_URL_TEST"] ??
  "postgresql://whiteboard:whiteboard@localhost:5433/construction_test";

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "lib/**/*.test.ts", "app/**/*.test.ts"],
          exclude: ["**/*.http.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "http",
          environment: "node",
          include: ["app/**/*.http.test.ts", "src/**/*.http.test.ts"],
          env: {
            DATABASE_URL: TEST_DATABASE_URL,
            BETTER_AUTH_SECRET: "http-tests-only-secret-0123456789abcdef",
            BETTER_AUTH_URL: "http://localhost:3002",
            EMAIL_TRANSPORT: "outbox",
            SMS_TRANSPORT: "outbox",
            OTP_TEST_CODE: "246810",
            // Per-IP limits off; the per-mobile OTP limit always applies.
            AUTH_RATE_LIMIT: "off",
            CONSTRUCTION_PRIVATE_DATA_KEY:
              "aHR0cC10ZXN0cy1vbmx5LXByaXZhdGUtZGF0YS1rZXk=",
            // Files go to disk, never to Vercel Blob (CM-115).
            BLOB_READ_WRITE_TOKEN: "",
            BLOB_LOCAL_DIR: path.join(
              os.tmpdir(),
              "construction-blob-http-tests",
            ),
          },
          globalSetup: ["./vitest.http-global-setup.ts"],
          // One database; files must not interleave their writes.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
            storybookScript: "bun run storybook -- --no-open",
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
