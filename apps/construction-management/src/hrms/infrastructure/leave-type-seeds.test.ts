import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { seedLeaveTypes } from "./prisma-leave-type-store";

const BACKFILL = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../packages/db/construction/prisma/migrations/20261010140000_construction_hrms_leave_type_seeds/migration.sql",
);

type BackfillRow = {
  name: string;
  yearlyLimit: number;
  isPaid: boolean;
  carryForward: boolean;
  maxCarryForward: number | null;
  accrualMode: string;
  accrualFrequency: string | null;
  accrualDay: number | null;
  creditPerPeriod: number | null;
};

/** The VALUES rows of the backfill migration, casts removed. */
function backfillRows(): BackfillRow[] {
  return readFileSync(BACKFILL, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("('"))
    .map((line) => {
      const cells = line
        .replace(/::decimal\(6,2\)|::integer/g, "")
        .replace(/^\(|\),?$/g, "")
        .split(",")
        .map((cell) => cell.trim());
      const text = (cell: string | undefined) =>
        cell == null || cell === "NULL" ? null : cell.replace(/^'|'$/g, "");
      const number = (cell: string | undefined) =>
        cell == null || cell === "NULL" ? null : Number(cell);
      return {
        name: text(cells[0]) ?? "",
        yearlyLimit: number(cells[1]) ?? -1,
        isPaid: cells[2] === "true",
        carryForward: cells[3] === "true",
        maxCarryForward: number(cells[4]),
        accrualMode: text(cells[5]) ?? "",
        accrualFrequency: text(cells[6]),
        accrualDay: number(cells[7]),
        creditPerPeriod: number(cells[8]),
      };
    });
}

describe("leave type seeds (CM-310)", () => {
  it("are the six types of modules/10 with the accrual modes of ADR CM-0012 §7", () => {
    expect(
      seedLeaveTypes().map((type) => [
        type.name,
        type.yearlyLimit,
        type.isPaid,
        type.accrualMode,
        type.creditPerPeriod,
        type.carryForward,
      ]),
    ).toEqual([
      ["Casual Leave", 12, true, "upfront", null, false],
      ["Compensatory Off", 0, true, "none", null, false],
      ["Loss of Pay", 0, false, "none", null, false],
      ["Maternity", 182, true, "periodic", 15.17, false],
      ["Privilege Leave", 15, true, "periodic", 1.25, true],
      ["Sick", 7, true, "periodic", 0.58, false],
    ]);
  });

  it("are backfilled for existing Companies exactly as the JSON says", () => {
    expect(backfillRows()).toEqual(
      seedLeaveTypes().map((type) => ({
        name: type.name,
        yearlyLimit: type.yearlyLimit,
        isPaid: type.isPaid,
        carryForward: type.carryForward,
        maxCarryForward: type.maxCarryForward,
        accrualMode: type.accrualMode,
        accrualFrequency: type.accrualFrequency,
        accrualDay: type.accrualDay,
        creditPerPeriod: type.creditPerPeriod,
      })),
    );
  });
});
