import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "prisma/config";

// Prisma skips `.env` loading once a config file exists, so load it here.
// CI and deployments set DATABASE_URL directly and have no `.env`.
const envFile = path.join(import.meta.dirname, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Construction Management's database only (ADR-0040). One schema file per bounded context
// (ADR-0030); migrations stay in `prisma/migrations` instead of beside the
// datasource file.
export default defineConfig({
  schema: path.join("prisma", "schema"),
  migrations: { path: path.join("prisma", "migrations") },
});
