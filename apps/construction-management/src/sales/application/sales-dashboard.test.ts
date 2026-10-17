import { describe, expect, it } from "vitest";

import { callActivityRange, conversionRate } from "./sales-dashboard";

describe("Inquiry section rules (CM-1008)", () => {
  it("rounds the conversion rate to one decimal and leaves it out without inquiries", () => {
    expect(conversionRate(1, 3)).toBe(33.3);
    expect(conversionRate(2, 3)).toBe(66.7);
    expect(conversionRate(0, 0)).toBeNull();
  });

  it("bounds Call Activity in the Company's zone; weeks start on Monday", () => {
    const zone = "Asia/Kolkata";
    // 2026-10-17 is a Saturday.
    const week = callActivityRange("this_week", "2026-10-17", zone);
    expect(week.from?.toISOString()).toBe("2026-10-11T18:30:00.000Z");
    expect(week.to?.toISOString()).toBe("2026-10-17T18:30:00.000Z");
    const yesterday = callActivityRange("yesterday", "2026-10-17", zone);
    expect(yesterday.from?.toISOString()).toBe("2026-10-15T18:30:00.000Z");
    expect(
      callActivityRange("this_month", "2026-10-17", zone).from?.toISOString(),
    ).toBe("2026-09-30T18:30:00.000Z");
    expect(callActivityRange("all_time", "2026-10-17", zone)).toEqual({
      from: null,
      to: null,
    });
  });
});
