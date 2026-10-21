import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SEED_FUNNEL_STAGES,
  SEED_LEAD_SOURCES,
  SEED_LOST_REASONS,
} from "./seed-project-sales";

const BACKFILL = join(
  __dirname,
  "../../../../../packages/db/construction/prisma/migrations/20261017090200_construction_sales_project_seeds/migration.sql",
);

function namesIn(sql: string, table: string): string[] {
  const start = sql.indexOf(`INSERT INTO "construction_sales"."${table}"`);
  const values = sql.slice(start, sql.indexOf(") AS s", start));
  return [...values.matchAll(/\('([^']+)'/g)].map((match) => match[1] ?? "");
}

describe("per-Project sales seeds (CM-0022 §2)", () => {
  const sql = readFileSync(BACKFILL, "utf8");

  it("starts every Project with the default funnel, in order", () => {
    expect(SEED_FUNNEL_STAGES).toEqual([
      "New",
      "Contacted",
      "Site Visit",
      "Negotiation",
    ]);
  });

  it("backfills existing Projects with the same names as new ones get", () => {
    expect(namesIn(sql, "funnel_stages")).toEqual(SEED_FUNNEL_STAGES);
    expect(namesIn(sql, "lead_sources")).toEqual(SEED_LEAD_SOURCES);
    expect(namesIn(sql, "lost_reasons")).toEqual(SEED_LOST_REASONS);
  });
});
