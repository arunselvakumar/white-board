import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { isGstStateCode } from "@/src/shared-kernel/gst-states";

import { PT_SLAB_SEEDS, statutorySeedSql } from "./statutory-seeds";

const MIGRATIONS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/construction/prisma/migrations",
);

/** Every line of every migration that inserts a statutory row. */
function migrationInserts(): string[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) =>
      readFileSync(path.join(MIGRATIONS, entry.name, "migration.sql"), "utf8")
        .split("\n")
        .filter((line) =>
          line.startsWith('INSERT INTO "construction_hrms"."statutory_'),
        ),
    );
}

describe("statutory seeds (ADR CM-0008)", () => {
  it("are inserted by the migrations exactly as the JSON says", () => {
    const expected = statutorySeedSql();
    const inserted = migrationInserts();
    expect(new Set(expected).size).toBe(expected.length);
    expect([...inserted].sort()).toEqual([...expected].sort());
  });

  it("have PT slabs that do not overlap within a state and date", () => {
    for (const slab of PT_SLAB_SEEDS) {
      expect(isGstStateCode(slab.stateCode)).toBe(true);
      expect(slab.grossTo == null || slab.grossTo >= slab.grossFrom).toBe(true);
      const overlapping = PT_SLAB_SEEDS.filter(
        (other) =>
          other !== slab &&
          other.stateCode === slab.stateCode &&
          other.effectiveFrom === slab.effectiveFrom &&
          other.appliesTo === slab.appliesTo &&
          other.grossFrom <= (slab.grossTo ?? Number.MAX_SAFE_INTEGER) &&
          slab.grossFrom <= (other.grossTo ?? Number.MAX_SAFE_INTEGER),
      );
      expect(overlapping).toEqual([]);
    }
  });
});
