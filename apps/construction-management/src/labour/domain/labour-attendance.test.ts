import { describe, expect, it } from "vitest";

import {
  assertDistinctLabourers,
  dayLedgerEntries,
  priceDay,
  withPaidLeave,
  type WageCard,
} from "./labour-attendance";

const daily: WageCard = {
  wageType: "daily",
  wagePerDay: 80_000,
  wagePerMonth: null,
  overtimeWagePerHour: 12_000,
};

function price(mark: Parameters<typeof priceDay>[0]["mark"], card = daily) {
  return priceDay({ mark, card, projectId: "p1", date: "2026-10-05" });
}

describe("priceDay", () => {
  it("snapshots the wage and prices overtime at the Labour's rate", () => {
    const day = price({
      labourId: "l1",
      status: "present",
      shift: " Shift 1 ",
      overtime: [{ labourCategoryId: "c1", hours: "2.5" }],
    });
    expect(day).toMatchObject({
      wageType: "daily",
      wageRate: 80_000,
      earned: 80_000,
      shift: "Shift 1",
      overtime: [{ hours: "2.5", ratePerHour: 12_000, amount: 30_000 }],
    });
    expect(dayLedgerEntries(day, "a1")).toEqual([
      expect.objectContaining({ kind: "earned", amount: 80_000 }),
      expect.objectContaining({ kind: "overtime", amount: 30_000 }),
    ]);
  });

  it("keeps the overtime rate within ₹2 crore and a day's overtime within an integer", () => {
    expect(() =>
      price({
        labourId: "l1",
        status: "present",
        overtime: [
          { labourCategoryId: null, hours: 1, ratePerHour: 2_000_000_001 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: "OVERTIME_RATE_INVALID" }));
    expect(() =>
      price({
        labourId: "l1",
        status: "present",
        overtime: [
          { labourCategoryId: null, hours: 2, ratePerHour: 2_000_000_000 },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: "AMOUNT_TOO_LARGE" }));
  });

  it("lets a line override the overtime rate", () => {
    expect(
      price({
        labourId: "l1",
        status: "holiday",
        overtime: [{ labourCategoryId: null, hours: 4, ratePerHour: 15_000 }],
      }),
    ).toMatchObject({ earned: 0, overtime: [{ amount: 60_000 }] });
  });

  it("refuses overtime on an Absent day and more than 24 hours a day", () => {
    expect(() =>
      price({
        labourId: "l1",
        status: "absent",
        overtime: [{ labourCategoryId: null, hours: 1 }],
      }),
    ).toThrow(expect.objectContaining({ code: "OVERTIME_ON_ABSENT_DAY" }));
    expect(() =>
      price({
        labourId: "l1",
        status: "present",
        overtime: [
          { labourCategoryId: null, hours: 12 },
          { labourCategoryId: null, hours: "12.01" },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: "OVERTIME_HOURS_INVALID" }));
  });

  it("allows Paid Leave only on leave, and re-prices it", () => {
    expect(() =>
      price({ labourId: "l1", status: "present", isPaidLeave: true }),
    ).toThrow(expect.objectContaining({ code: "PAID_LEAVE_NEEDS_LEAVE" }));
    const leave = price({ labourId: "l1", status: "on_leave" });
    expect(leave.earned).toBe(0);
    expect(withPaidLeave(leave, true).earned).toBe(80_000);
  });

  it("prorates a monthly wage", () => {
    expect(
      price(
        { labourId: "l1", status: "present" },
        {
          wageType: "monthly",
          wagePerDay: null,
          wagePerMonth: 31_00_000,
          overtimeWagePerHour: 0,
        },
      ).earned,
    ).toBe(1_00_000);
  });

  it("marks each Labour once per command", () => {
    expect(() => {
      assertDistinctLabourers([
        { labourId: "l1", status: "present" },
        { labourId: "l1", status: "absent" },
      ]);
    }).toThrow(expect.objectContaining({ code: "LABOUR_MARKED_TWICE" }));
    expect(() => {
      assertDistinctLabourers([]);
    }).toThrow(expect.objectContaining({ code: "ATTENDANCE_EMPTY" }));
  });
});
