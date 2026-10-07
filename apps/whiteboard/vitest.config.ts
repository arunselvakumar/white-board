import path from "node:path";
import { fileURLToPath } from "node:url";

import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const alias = { "@": dirname };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "lib/**/*.test.ts",
            "app/api/**/*.test.ts",
            "proxy.test.ts",
          ],
          exclude: ["**/*.http.test.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "http",
          environment: "node",
          include: ["app/api/**/*.http.test.ts", "src/**/*.http.test.ts"],
          env: {
            DATABASE_URL:
              process.env["DATABASE_URL_TEST"] ??
              "postgresql://whiteboard:whiteboard@localhost:5433/whiteboard_test",
            BETTER_AUTH_SECRET: "http-tests-only-secret-0123456789abcdef",
            BETTER_AUTH_URL: "http://localhost:3000",
            EMAIL_TRANSPORT: "outbox",
          },
          globalSetup: ["./vitest.http-global-setup.ts"],
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
