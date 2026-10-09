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
  workingHours: "8",
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
          workingHours: "8",
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

describe("priceDay with check-in and check-out (ADR CM-0011)", () => {
  const timed = { labourId: "l1", status: "present" as const };
  const fromTimes = { labourCategoryId: "c1", fromTimes: true };

  it("keeps the times, a 60-minute break by default and the working hours", () => {
    const day = price(
      { ...timed, checkIn: "09:00", checkOut: "18:00" },
      { ...daily, workingHours: "8.50" },
    );
    expect(day).toMatchObject({
      checkIn: "09:00",
      checkOut: "18:00",
      breakMinutes: 60,
      workingHours: "8.5",
      earned: 80_000,
      overtime: [],
    });
    // A check-in alone is allowed and has the break too.
    expect(price({ ...timed, checkIn: "08:00" })).toMatchObject({
      checkIn: "08:00",
      checkOut: null,
      breakMinutes: 60,
    });
    // No times: no break, even if one is sent; blanks are no time.
    expect(
      price({ ...timed, checkIn: " ", checkOut: "", breakMinutes: 30 }),
    ).toMatchObject({ checkIn: null, checkOut: null, breakMinutes: null });
  });

  it("works out the line from the times, ignoring hours sent with it", () => {
    const day = price({
      ...timed,
      checkIn: "08:00",
      checkOut: "19:30",
      breakMinutes: 60,
      overtime: [
        { ...fromTimes, hours: 5 },
        { labourCategoryId: null, hours: 1, ratePerHour: 15_000 },
      ],
    });
    expect(day.overtime).toEqual([
      {
        labourCategoryId: "c1",
        hours: "2.5",
        ratePerHour: 12_000,
        amount: 30_000,
        fromTimes: true,
      },
      {
        labourCategoryId: null,
        hours: "1",
        ratePerHour: 15_000,
        amount: 15_000,
        fromTimes: false,
      },
    ]);
    // An edited rate on the line from the times stays.
    expect(
      price({
        ...timed,
        checkIn: "08:00",
        checkOut: "19:30",
        overtime: [{ ...fromTimes, ratePerHour: 20_000 }],
      }).overtime[0],
    ).toMatchObject({ hours: "2.5", amount: 50_000 });
  });

  it("measures overtime against the Labour's working hours, on a Half Day too", () => {
    const day = price(
      {
        labourId: "l1",
        status: "half_day",
        checkIn: "08:00",
        checkOut: "19:30",
        overtime: [fromTimes],
      },
      { ...daily, workingHours: "9.5" },
    );
    expect(day).toMatchObject({
      earned: 40_000,
      workingHours: "9.5",
      overtime: [{ hours: "1", fromTimes: true }],
    });
    // A night shift past midnight.
    expect(
      price({
        ...timed,
        checkIn: "20:00",
        checkOut: "06:00",
        breakMinutes: 0,
        overtime: [fromTimes],
      }).overtime,
    ).toMatchObject([{ hours: "2" }]);
  });

  it("drops the line from the times without a check-out or without extra time", () => {
    expect(
      price({ ...timed, checkIn: "08:00", overtime: [fromTimes] }).overtime,
    ).toEqual([]);
    expect(
      price({
        ...timed,
        checkIn: "09:00",
        checkOut: "18:00",
        overtime: [fromTimes],
      }).overtime,
    ).toEqual([]);
    expect(price({ ...timed, overtime: [fromTimes] }).overtime).toEqual([]);
  });

  it("allows one line from the times, within 24 overtime hours a day", () => {
    expect(() =>
      price({
        ...timed,
        checkIn: "08:00",
        checkOut: "19:30",
        overtime: [fromTimes, fromTimes],
      }),
    ).toThrow(expect.objectContaining({ code: "OVERTIME_FROM_TIMES_TWICE" }));
    expect(() =>
      price({
        ...timed,
        checkIn: "08:00",
        checkOut: "19:30",
        overtime: [fromTimes, { labourCategoryId: null, hours: 23 }],
      }),
    ).toThrow(expect.objectContaining({ code: "OVERTIME_HOURS_INVALID" }));
    // A manual line still needs its hours.
    expect(() =>
      price({ ...timed, overtime: [{ labourCategoryId: null }] }),
    ).toThrow(expect.objectContaining({ code: "OVERTIME_HOURS_INVALID" }));
  });

  it("refuses times that do not fit the day", () => {
    for (const status of ["absent", "on_leave", "holiday"] as const)
      expect(() => price({ labourId: "l1", status, checkIn: "09:00" })).toThrow(
        expect.objectContaining({ code: "TIMES_NEED_PRESENT" }),
      );
    expect(() => price({ ...timed, checkOut: "18:00" })).toThrow(
      expect.objectContaining({ code: "CHECK_IN_REQUIRED" }),
    );
    expect(() =>
      price({ ...timed, checkIn: "09:00", checkOut: "09:00" }),
    ).toThrow(expect.objectContaining({ code: "CHECK_OUT_SAME_AS_CHECK_IN" }));
    expect(() =>
      price({
        ...timed,
        checkIn: "09:00",
        checkOut: "10:00",
        breakMinutes: 60,
      }),
    ).toThrow(expect.objectContaining({ code: "BREAK_TOO_LONG" }));
    expect(() =>
      price({ ...timed, checkIn: "09:00", breakMinutes: 721 }),
    ).toThrow(expect.objectContaining({ code: "BREAK_INVALID" }));
    expect(() => price({ ...timed, checkIn: "9:00" })).toThrow(
      expect.objectContaining({
        code: "TIME_INVALID",
        details: { field: "checkIn" },
      }),
    );
  });
});
