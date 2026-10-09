import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@repo/whiteboard-db";

const ADMIN_URL =
  process.env["DATABASE_URL_ADMIN"] ??
  "postgresql://whiteboard:whiteboard@localhost:5433/whiteboard";
const TEST_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgresql://whiteboard:whiteboard@localhost:5433/whiteboard_test";

export default async function setup(): Promise<void> {
  const admin = new PrismaClient({
    datasources: { db: { url: ADMIN_URL } },
  });
  try {
    const existing = await admin.$queryRaw<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname = 'whiteboard_test'
    `;
    if (existing[0] == null) {
      await admin.$executeRawUnsafe("CREATE DATABASE whiteboard_test");
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
    "../../packages/db/whiteboard",
  );
  execSync("bunx prisma migrate deploy", {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "inherit",
  });
}
