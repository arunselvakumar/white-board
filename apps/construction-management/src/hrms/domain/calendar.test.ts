import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  addMonths,
  assertMonthKey,
  datesOf,
  daysInMonth,
  firstDayOf,
  isIsoWeekday,
  isMonthKey,
  isoWeekday,
  lastDayOf,
  monthKeyOf,
  monthNumber,
} from "./calendar";

describe("isoWeekday", () => {
  it("numbers Monday 1 to Sunday 7", () => {
    expect(isoWeekday("2026-10-05")).toBe(1); // Monday
    expect(isoWeekday("2026-10-10")).toBe(6); // Saturday
    expect(isoWeekday("2026-10-11")).toBe(7); // Sunday
    expect(isoWeekday("2024-02-29")).toBe(4); // Thursday, leap day
  });

  it("knows a weekday number", () => {
    expect(isIsoWeekday(1)).toBe(true);
    expect(isIsoWeekday(7)).toBe(true);
    expect(isIsoWeekday(0)).toBe(false);
    expect(isIsoWeekday(8)).toBe(false);
    expect(isIsoWeekday(1.5)).toBe(false);
  });

  it("refuses a date that is not real", () => {
    expect(() => isoWeekday("2026-02-30")).toThrow(DomainError);
  });
});

describe("month keys", () => {
  it("accepts YYYY-MM only", () => {
    expect(isMonthKey("2026-10")).toBe(true);
    expect(isMonthKey("2026-13")).toBe(false);
    expect(isMonthKey("2026-1")).toBe(false);
    expect(isMonthKey("2026-10-01")).toBe(false);
    expect(() => assertMonthKey("26-10")).toThrow(DomainError);
  });

  it("knows a month's days", () => {
    expect(monthKeyOf("2026-10-10")).toBe("2026-10");
    expect(monthNumber("2026-02")).toBe(2);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-09")).toBe(30);
    expect(daysInMonth("2026-10")).toBe(31);
    expect(firstDayOf("2026-09")).toBe("2026-09-01");
    expect(lastDayOf("2026-09")).toBe("2026-09-30");
    const october = datesOf("2026-10");
    expect(october).toHaveLength(31);
    expect(october[0]).toBe("2026-10-01");
    expect(october.at(-1)).toBe("2026-10-31");
  });

  it("adds months across years", () => {
    expect(addMonths("2026-10", 1)).toBe("2026-11");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", 24)).toBe("2028-03");
  });
});
