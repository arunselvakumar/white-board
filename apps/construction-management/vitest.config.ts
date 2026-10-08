import path from "node:path";
import { fileURLToPath } from "node:url";

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
          include: [
            "src/**/*.test.ts",
            "lib/**/*.test.ts",
            "app/api/**/*.test.ts",
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
            DATABASE_URL: TEST_DATABASE_URL,
            BETTER_AUTH_SECRET: "http-tests-only-secret-0123456789abcdef",
            BETTER_AUTH_URL: "http://localhost:3002",
            EMAIL_TRANSPORT: "outbox",
          },
          globalSetup: ["./vitest.http-global-setup.ts"],
          // One database; files must not interleave their writes.
          fileParallelism: false,
        },
      },
    ],
  },
});
