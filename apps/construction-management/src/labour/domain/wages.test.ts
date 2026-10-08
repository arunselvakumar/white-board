import { describe, expect, it } from "vitest";

import {
  dayEarned,
  daysInMonth,
  overtimeAmount,
  overtimeHours,
  paidHalves,
  vendorLineAmount,
  weekdayOf,
} from "./wages";

describe("dayEarned", () => {
  const daily = { wageType: "daily" as const, wageRate: 80_000 };

  it("pays a daily wage for present and half days", () => {
    const day = { ...daily, isPaidLeave: false, date: "2026-10-05" };
    expect(dayEarned({ ...day, status: "present" })).toBe(80_000);
    expect(dayEarned({ ...day, status: "half_day" })).toBe(40_000);
    expect(dayEarned({ ...day, status: "absent" })).toBe(0);
  });

  it("does not pay a daily wage for a holiday or unpaid leave", () => {
    const day = { ...daily, date: "2026-10-04" };
    expect(dayEarned({ ...day, status: "holiday", isPaidLeave: false })).toBe(
      0,
    );
    expect(dayEarned({ ...day, status: "on_leave", isPaidLeave: false })).toBe(
      0,
    );
    expect(dayEarned({ ...day, status: "on_leave", isPaidLeave: true })).toBe(
      80_000,
    );
  });

  it("prorates a monthly wage by the calendar days of that month", () => {
    const monthly = {
      wageType: "monthly" as const,
      wageRate: 31_00_000,
      isPaidLeave: false,
    };
    // ₹31,000 over October's 31 days is ₹1,000 a day.
    expect(
      dayEarned({ ...monthly, status: "present", date: "2026-10-10" }),
    ).toBe(1_00_000);
    // February 2027 has 28 days: ₹31,000 ÷ 28 = ₹1,107.142857… → ₹1,107.14.
    expect(
      dayEarned({ ...monthly, status: "present", date: "2027-02-10" }),
    ).toBe(1_10_714);
    expect(
      dayEarned({ ...monthly, status: "holiday", date: "2026-10-11" }),
    ).toBe(1_00_000);
    expect(
      dayEarned({ ...monthly, status: "half_day", date: "2026-10-12" }),
    ).toBe(50_000);
  });

  it("rounds half up to the paisa", () => {
    // 1001 paise × 0.5 = 500.5 → 501.
    expect(
      dayEarned({
        wageType: "daily",
        wageRate: 1001,
        status: "half_day",
        isPaidLeave: false,
        date: "2026-10-05",
      }),
    ).toBe(501);
  });

  it("knows which statuses are paid", () => {
    expect(paidHalves("monthly", "on_leave", false)).toBe(0);
    expect(paidHalves("monthly", "on_leave", true)).toBe(2);
  });
});

describe("calendar helpers", () => {
  it("counts days in a month, leap years included", () => {
    expect(daysInMonth("2026-10-01")).toBe(31);
    expect(daysInMonth("2028-02-15")).toBe(29);
    expect(daysInMonth("2027-02-15")).toBe(28);
  });

  it("names the weekday, Sunday = 0", () => {
    expect(weekdayOf("2026-10-04")).toBe(0);
    expect(weekdayOf("2026-10-10")).toBe(6);
  });
});

describe("overtime", () => {
  it("accepts 0 < hours ≤ 24 in hundredths", () => {
    expect(overtimeHours("2.5")).toBe("2.5");
    expect(overtimeHours(24)).toBe("24");
    expect(overtimeHours("1.25")).toBe("1.25");
    for (const bad of ["0", "-1", "24.01", "1.234", "x"])
      expect(() => overtimeHours(bad)).toThrow(
        expect.objectContaining({ code: "OVERTIME_HOURS_INVALID" }),
      );
  });

  it("prices hours at the rate, rounded half up", () => {
    expect(overtimeAmount("2.5", 12_000)).toBe(30_000);
    expect(overtimeAmount("0.33", 10_001)).toBe(3300);
  });
});

describe("vendorLineAmount", () => {
  it("is full × rate + half × rate ÷ 2 + OT hours × OT rate", () => {
    expect(
      vendorLineAmount({
        fullDayCount: 10,
        halfDayCount: 3,
        overtimeHours: "6.5",
        ratePerDay: 70_000,
        overtimePerHour: 9_000,
      }),
    ).toBe(10 * 70_000 + 3 * 35_000 + 58_500);
  });

  it("rounds an odd half-day rate once, at the end", () => {
    expect(
      vendorLineAmount({
        fullDayCount: 0,
        halfDayCount: 1,
        overtimeHours: "0",
        ratePerDay: 70_001,
        overtimePerHour: 0,
      }),
    ).toBe(35_001);
  });
});
