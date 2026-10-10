import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  SEED_MATERIAL_CATEGORIES,
  SEED_MATERIALS,
  SEED_MEASUREMENT_UNITS,
} from "./seed-company-masters";

const BACKFILL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/construction/prisma/migrations/20261011100000_construction_masters_material_seeds/migration.sql",
);

/** The VALUES rows of each INSERT in the backfill, as arrays of strings. */
function backfillBlocks(): string[][][] {
  const sql = readFileSync(BACKFILL, "utf8");
  return sql
    .split("CROSS JOIN (VALUES")
    .slice(1)
    .map((block) =>
      (block.split(") AS s")[0] ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("('"))
        .map((line) =>
          [...line.matchAll(/'((?:[^']|'')*)'/g)].map((match) =>
            (match[1] ?? "").replace(/''/g, "'"),
          ),
        ),
    );
}

describe("procurement master seeds (CM-501)", () => {
  it("are the 41 units of modules/02, a starter category list and Cement OPC 53", () => {
    expect(SEED_MEASUREMENT_UNITS).toHaveLength(41);
    expect(SEED_MEASUREMENT_UNITS).toEqual(
      expect.arrayContaining(["Bag", "cum", "sqft", "Trip", "%"]),
    );
    expect(
      new Set(SEED_MEASUREMENT_UNITS.map((name) => name.toLowerCase())).size,
    ).toBe(41);
    expect(SEED_MATERIAL_CATEGORIES).toEqual(
      expect.arrayContaining(["Civil Work Materials", "Fire & Safety"]),
    );
    expect(SEED_MATERIALS).toEqual([
      { name: "Cement OPC 53", category: "Civil Work Materials", unit: "Bag" },
    ]);
    for (const material of SEED_MATERIALS) {
      expect(SEED_MEASUREMENT_UNITS).toContain(material.unit);
      expect(SEED_MATERIAL_CATEGORIES).toContain(material.category);
    }
  });

  it("are backfilled for existing Companies exactly as the JSON says", () => {
    const [units, categories, materials] = backfillBlocks();
    expect(units?.map(([name]) => name)).toEqual(SEED_MEASUREMENT_UNITS);
    expect(categories?.map(([name]) => name)).toEqual(SEED_MATERIAL_CATEGORIES);
    expect(
      materials?.map(([name, category, unit]) => ({ name, category, unit })),
    ).toEqual(SEED_MATERIALS);
  });
});
