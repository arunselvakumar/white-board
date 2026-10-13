import { describe, expect, it } from "vitest";

import {
  academicYear,
  financialYear,
  monthsIn,
  resolveReportPeriod,
  shiftMonth,
  untilToday,
} from "./report-period";

const resolve = (
  preset: Parameters<typeof resolveReportPeriod>[0]["preset"],
  today = "2026-10-13",
  extra: { from?: string; to?: string; academicYearStartMonth?: number } = {},
) =>
  resolveReportPeriod({
    preset,
    today,
    academicYearStartMonth: extra.academicYearStartMonth ?? 6,
    from: extra.from,
    to: extra.to,
  });

describe("report periods (Reports §6.3)", () => {
  it("resolves each preset", () => {
    expect(resolve("today")).toMatchObject({
      from: "2026-10-13",
      to: "2026-10-13",
    });
    expect(resolve("yesterday")).toMatchObject({
      from: "2026-10-12",
      to: "2026-10-12",
    });
    // 13 Oct 2026 is a Tuesday; weeks run Monday to Sunday.
    expect(resolve("this_week")).toMatchObject({
      from: "2026-10-12",
      to: "2026-10-18",
    });
    expect(resolve("last_week")).toMatchObject({
      from: "2026-10-05",
      to: "2026-10-11",
    });
    expect(resolve("this_month")).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(resolve("last_month")).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-30",
    });
    expect(resolve("this_quarter")).toMatchObject({
      from: "2026-10-01",
      to: "2026-12-31",
    });
    expect(resolve("this_financial_year")).toMatchObject({
      from: "2026-04-01",
      to: "2027-03-31",
    });
    expect(resolve("last_financial_year")).toMatchObject({
      from: "2025-04-01",
      to: "2026-03-31",
    });
    expect(resolve("this_academic_year")).toMatchObject({
      from: "2026-06-01",
      to: "2027-05-31",
    });
  });

  it("rolls the year over in January and February", () => {
    expect(resolve("last_month", "2026-01-15")).toMatchObject({
      from: "2025-12-01",
      to: "2025-12-31",
    });
    expect(financialYear("2026-02-10")).toEqual({
      from: "2025-04-01",
      to: "2026-03-31",
    });
    expect(academicYear("2026-03-01", 6)).toEqual({
      from: "2025-06-01",
      to: "2026-05-31",
    });
    expect(academicYear("2026-03-01", 1)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("checks a custom range", () => {
    expect(
      resolve("custom", "2026-10-13", { from: "2026-10-01", to: "2026-10-05" }),
    ).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-05",
    });
    expect(() => resolve("custom")).toThrow(/start and end/);
    expect(() =>
      resolve("custom", "2026-10-13", { from: "2026-10-05", to: "2026-10-01" }),
    ).toThrow(/on or after/);
    expect(() =>
      resolve("custom", "2026-10-13", { from: "2020-01-01", to: "2026-10-01" }),
    ).toThrow(/two years/);
  });

  it("stops at today", () => {
    expect(
      untilToday({ from: "2026-10-01", to: "2026-10-31" }, "2026-10-13"),
    ).toEqual({
      from: "2026-10-01",
      to: "2026-10-13",
    });
    expect(
      untilToday({ from: "2026-11-01", to: "2026-11-30" }, "2026-10-13"),
    ).toBeNull();
  });

  it("walks months", () => {
    expect(shiftMonth("2026-01", 1)).toBe("2025-12");
    expect(shiftMonth("2026-12", -1)).toBe("2027-01");
    expect(monthsIn("2026-11-15", "2027-02-01")).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});
