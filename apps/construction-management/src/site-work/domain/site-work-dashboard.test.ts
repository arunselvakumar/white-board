import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  checkDashboardRange,
  contractorWiseLabour,
  equipmentUsageSummary,
  hundredths,
  labourAvailability,
  TOP_EQUIPMENT,
  type EquipmentUsageTotals,
} from "./site-work-dashboard";

describe("labour availability", () => {
  it("fills every day of the range with worksheet labour and attendance heads", () => {
    expect(
      labourAvailability(
        { from: "2026-08-01", to: "2026-08-03" },
        [
          { date: "2026-08-01", skilled: 4, unskilled: 6 },
          { date: "2026-08-03", skilled: 1, unskilled: 0 },
        ],
        [
          { date: "2026-08-01", heads: 12 },
          { date: "2026-08-02", heads: 3 },
          { date: "2026-08-02", heads: 2 },
        ],
      ),
    ).toEqual([
      { date: "2026-08-01", worksheet: 10, attendance: 12 },
      { date: "2026-08-02", worksheet: 0, attendance: 5 },
      { date: "2026-08-03", worksheet: 1, attendance: 0 },
    ]);
  });

  it("refuses a backwards or too long range", () => {
    expect(() =>
      checkDashboardRange({ from: "2026-08-02", to: "2026-08-01" }),
    ).toThrow(DomainError);
    expect(() =>
      checkDashboardRange({ from: "2025-01-01", to: "2026-08-01" }),
    ).toThrow("Choose at most a year.");
    expect(
      checkDashboardRange({ from: "2026-08-01", to: "2026-08-01" }),
    ).toEqual({ from: "2026-08-01", to: "2026-08-01" });
  });
});

describe("contractor-wise labour", () => {
  it("names each row, totals it and puts the most labour first", () => {
    const rows = contractorWiseLabour(
      [
        { contractorId: "c1", departmentId: "d1", skilled: 2, unskilled: 3 },
        { contractorId: "c2", departmentId: "d2", skilled: 8, unskilled: 1 },
        { contractorId: "gone", departmentId: "d1", skilled: 0, unskilled: 5 },
      ],
      {
        contractors: new Map([
          ["c1", "Velan Constructions"],
          ["c2", "Sri Murugan Works"],
        ]),
        departments: new Map([
          ["d1", "Masonry"],
          ["d2", "Shuttering"],
        ]),
      },
    );
    expect(
      rows.map((row) => [row.contractor, row.department, row.total]),
    ).toEqual([
      ["Sri Murugan Works", "Shuttering", 9],
      [null, "Masonry", 5],
      ["Velan Constructions", "Masonry", 5],
    ]);
  });
});

function machine(
  patch: Partial<EquipmentUsageTotals> & { equipmentId: string },
): EquipmentUsageTotals {
  return {
    name: patch.equipmentId.toUpperCase(),
    equipmentNumber: `TN-${patch.equipmentId}`,
    ownership: "owned",
    basis: "hourly",
    sheets: 1,
    hoursHundredths: 0,
    kmHundredths: 0,
    trips: 0,
    fuelOverruns: 0,
    hireCost: 0,
    ...patch,
  };
}

describe("equipment usage summary", () => {
  it("totals sheets, hours, km, trips, overruns and hire cost", () => {
    const summary = equipmentUsageSummary([
      machine({
        equipmentId: "jcb",
        sheets: 2,
        hoursHundredths: 1350,
        fuelOverruns: 1,
      }),
      machine({
        equipmentId: "excavator",
        ownership: "rented",
        sheets: 2,
        hoursHundredths: 1200,
        hireCost: 1_440_000,
      }),
      machine({ equipmentId: "tipper", basis: "trip", sheets: 3, trips: 18 }),
      machine({ equipmentId: "car", basis: "km", kmHundredths: 12_050 }),
    ]);
    expect(summary).toMatchObject({
      sheets: 8,
      hours: 25.5,
      km: 120.5,
      trips: 18,
      fuelOverruns: 1,
      hireCost: 1_440_000,
      ownership: {
        owned: { hours: 13.5, sheets: 2 },
        rented: { hours: 12, sheets: 2 },
      },
    });
    expect(
      summary.topEquipment.map((row) => [row.equipmentId, row.hours]),
    ).toEqual([
      ["jcb", 13.5],
      ["excavator", 12],
    ]);
  });

  it("shows at most eight hourly machines, the most hours first", () => {
    const machines = Array.from({ length: 10 }, (_, index) =>
      machine({
        equipmentId: `m${String(index)}`,
        hoursHundredths: (index + 1) * 100,
      }),
    );
    const top = equipmentUsageSummary(machines).topEquipment;
    expect(top).toHaveLength(TOP_EQUIPMENT);
    expect(top[0]?.equipmentId).toBe("m9");
    expect(top.at(-1)?.equipmentId).toBe("m2");
  });

  it("reads decimal strings as hundredths", () => {
    expect(hundredths("7.5")).toBe(750);
    expect(hundredths(null)).toBe(0);
    expect(hundredths("0.125")).toBe(13);
  });
});
