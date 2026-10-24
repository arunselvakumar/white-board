import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { e2eEnv } from "../playwright.config";

/**
 * Applies every migration to the end-to-end database (`migrate deploy`
 * creates it when missing) and checks Mailpit is up: sign-up codes and
 * invitations are read there. The database is never wiped; every test makes
 * its own Company.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = new URL(e2eEnv["DATABASE_URL"] ?? "");
  databaseUrl.searchParams.delete("connection_limit");
  try {
    execSync("bunx prisma migrate deploy", {
      cwd: path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../packages/db/construction",
      ),
      env: { ...process.env, DATABASE_URL: databaseUrl.toString() },
      stdio: "pipe",
    });
  } catch (error) {
    throw new Error(
      "Migrating the end-to-end database failed. Is Postgres up? docker compose up -d",
      { cause: error },
    );
  }

  const mailpit = e2eEnv["MAILPIT_URL"] ?? "http://localhost:8025";
  const response = await fetch(`${mailpit}/api/v1/info`).catch(() => null);
  if (response?.ok !== true)
    throw new Error(
      `End-to-end tests read email from Mailpit at ${mailpit}. Start it with: docker compose up -d mailpit`,
    );
}
