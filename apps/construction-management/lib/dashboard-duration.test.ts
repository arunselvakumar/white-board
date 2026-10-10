import { describe, expect, it } from "vitest";

import { durationProblem, presetDuration } from "./dashboard-duration";

describe("presetDuration", () => {
  it("ends today and starts the day after the same date back", () => {
    expect(presetDuration("last_30_days", "2026-10-10")).toEqual({
      preset: "last_30_days",
      from: "2026-09-11",
      to: "2026-10-10",
    });
    expect(presetDuration("last_3_months", "2026-10-10").from).toBe(
      "2026-07-11",
    );
    expect(presetDuration("last_12_months", "2026-10-10").from).toBe(
      "2025-10-11",
    );
    // The 31st three months back is clamped to the month's last day.
    expect(presetDuration("last_3_months", "2026-05-31").from).toBe(
      "2026-03-01",
    );
  });

  it("starts the financial year on 1 April", () => {
    expect(presetDuration("this_financial_year", "2026-10-10").from).toBe(
      "2026-04-01",
    );
    expect(presetDuration("this_financial_year", "2027-02-01").from).toBe(
      "2026-04-01",
    );
  });

  it("refuses a reversed or longer than a year custom range", () => {
    const custom = (from: string, to: string) =>
      durationProblem({ preset: "custom", from, to });
    expect(custom("2026-01-01", "2026-12-31")).toBeNull();
    expect(custom("2026-10-10", "2026-10-01")).not.toBeNull();
    expect(custom("2025-01-01", "2026-12-31")).not.toBeNull();
    // Every preset fits.
    expect(
      durationProblem(presetDuration("last_12_months", "2028-02-29")),
    ).toBeNull();
  });
});
