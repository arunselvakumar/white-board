import { describe, expect, it } from "vitest";

import {
  formatClock,
  formatGeneratedAt,
  formatPeriod,
  formatReportDate,
  formatRupees,
  indianGrouping,
} from "./report-format";

describe("report formatting (Reports §6.7)", () => {
  it("writes money with Indian grouping and paise only when recorded", () => {
    expect(formatRupees(12_500_000)).toBe("₹1,25,000");
    expect(formatRupees(34_250_000)).toBe("₹3,42,500");
    expect(formatRupees(125_050)).toBe("₹1,250.50");
    expect(formatRupees(0)).toBe("₹0");
    expect(indianGrouping(123_456_789)).toBe("12,34,56,789");
    expect(indianGrouping(999)).toBe("999");
  });

  it("writes dates as 12 Oct 2026", () => {
    expect(formatReportDate("2026-10-12")).toBe("12 Oct 2026");
    expect(formatPeriod("2026-10-01", "2026-10-31")).toBe(
      "1 Oct 2026 – 31 Oct 2026",
    );
    expect(formatPeriod("2026-10-12", "2026-10-12")).toBe("12 Oct 2026");
  });

  it("writes times and the generated stamp in the institute's zone", () => {
    expect(formatClock("16:00")).toBe("4 PM");
    expect(formatClock("09:30")).toBe("9:30 AM");
    expect(formatClock("00:00")).toBe("12 AM");
    expect(
      formatGeneratedAt(new Date("2026-10-13T05:10:00.000Z"), "Asia/Kolkata"),
    ).toBe("13 Oct 2026, 10:40 AM");
  });
});
