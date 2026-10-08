import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@repo/db";

const ADMIN_URL =
  process.env["DATABASE_URL_ADMIN"] ??
  "postgresql://whiteboard:whiteboard@localhost:5433/whiteboard";
const TEST_URL =
  process.env["CONSTRUCTION_DATABASE_URL_TEST"] ??
  "postgresql://whiteboard:whiteboard@localhost:5433/construction_test";
const TEST_DATABASE = new URL(TEST_URL).pathname.slice(1);

/** Creates `construction_test` if needed and applies every migration (ADR CM-0001). */
export default async function setup(): Promise<void> {
  const admin = new PrismaClient({
    datasources: { db: { url: ADMIN_URL } },
  });
  try {
    const existing = await admin.$queryRaw<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname = ${TEST_DATABASE}
    `;
    if (existing[0] == null) {
      if (!/^[a-z_][a-z0-9_]*$/.test(TEST_DATABASE))
        throw new Error(`Unexpected test database name: ${TEST_DATABASE}`);
      await admin.$executeRawUnsafe(`CREATE DATABASE ${TEST_DATABASE}`);
    }
  } catch (error) {
    throw new Error(
      "HTTP tests need Postgres. Start it with: docker compose up -d",
      { cause: error },
    );
  } finally {
    await admin.$disconnect();
  }

  const dbPackage = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../packages/db",
  );
  execSync("bunx prisma migrate deploy", {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "inherit",
  });
}
