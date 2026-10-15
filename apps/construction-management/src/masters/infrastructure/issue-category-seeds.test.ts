import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SEED_ISSUE_CATEGORIES } from "./seed-company-masters";

const SEED_MIGRATION = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/construction/prisma/migrations/20261014090100_construction_masters_issue_category_seeds/migration.sql",
);

/** The names in the migration's `VALUES` list, in order. */
function migrationNames(): string[] {
  const sql = readFileSync(SEED_MIGRATION, "utf8");
  const block = sql.split("CROSS JOIN (VALUES")[1]?.split(") AS s")[0] ?? "";
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("('"))
    .map((line) =>
      (/^\('((?:[^']|'')*)'\)/.exec(line)?.[1] ?? "").replace(/''/g, "'"),
    );
}

describe("Issue Category seeds (CM-801, ADR CM-0019 §1)", () => {
  it("are the 14 categories of modules/05, unique in any case", () => {
    expect(SEED_ISSUE_CATEGORIES).toHaveLength(14);
    expect(
      new Set(SEED_ISSUE_CATEGORIES.map((name) => name.toLowerCase())).size,
    ).toBe(14);
    expect(SEED_ISSUE_CATEGORIES).toEqual(
      expect.arrayContaining(["Quality", "RFI", "Safety"]),
    );
  });

  it("are seeded for existing Companies exactly as new Companies get them", () => {
    expect(migrationNames()).toEqual(SEED_ISSUE_CATEGORIES);
  });
});
