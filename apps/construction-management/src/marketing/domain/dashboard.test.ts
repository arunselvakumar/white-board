import { describe, expect, it } from "vitest";

import {
  bucketStartOf,
  bucketStarts,
  dashboardBucket,
  dashboardPeriod,
  mondayOf,
  shortNote,
  targetMonthOf,
} from "./dashboard";

describe("Dashboard period (ADR CM-0040 §13)", () => {
  it("starts the week on Monday", () => {
    // 2026-11-13 is a Friday.
    expect(mondayOf("2026-11-13")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    // A Sunday belongs to the week that began six days earlier.
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(dashboardPeriod({ kind: "this_week" }, "2026-11-15")).toEqual({
      kind: "this_week",
      from: "2026-11-09",
      to: "2026-11-15",
    });
  });

  it("takes a week across two months as it falls", () => {
    // Thursday 1 October 2026: the week began on Monday 28 September.
    expect(dashboardPeriod({ kind: "this_week" }, "2026-10-01")).toEqual({
      kind: "this_week",
      from: "2026-09-28",
      to: "2026-10-04",
    });
    // And across a year.
    expect(dashboardPeriod({ kind: "this_week" }, "2027-01-01")).toEqual({
      kind: "this_week",
      from: "2026-12-28",
      to: "2027-01-03",
    });
  });

  it("covers this month and last month to their last day", () => {
    expect(dashboardPeriod({ kind: "this_month" }, "2026-11-13")).toEqual({
      kind: "this_month",
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(dashboardPeriod({ kind: "last_month" }, "2026-03-31")).toEqual({
      kind: "last_month",
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(dashboardPeriod({ kind: "this_month" }, "2028-02-01").to).toBe(
      "2028-02-29",
    );
    // January's last month is the previous December.
    expect(dashboardPeriod({ kind: "last_month" }, "2027-01-01")).toEqual({
      kind: "last_month",
      from: "2026-12-01",
      to: "2026-12-31",
    });
    expect(dashboardPeriod({ kind: "this_month" }, "2026-12-31").to).toBe(
      "2026-12-31",
    );
  });

  it("takes a custom period of one day up to a year, both days given", () => {
    expect(
      dashboardPeriod(
        { kind: "custom", from: "2026-11-13", to: "2026-11-13" },
        "2026-11-13",
      ),
    ).toEqual({ kind: "custom", from: "2026-11-13", to: "2026-11-13" });
    expect(
      dashboardPeriod(
        { kind: "custom", from: "2024-01-01", to: "2024-12-31" },
        "2026-11-13",
      ).to,
    ).toBe("2024-12-31");
    const today = "2026-11-13";
    expect(() => dashboardPeriod({ kind: "custom" }, today)).toThrow(
      expect.objectContaining({ code: "DASHBOARD_PERIOD_INVALID" }),
    );
    expect(() =>
      dashboardPeriod({ kind: "custom", from: "2026-11-01" }, today),
    ).toThrow(expect.objectContaining({ code: "DASHBOARD_PERIOD_INVALID" }));
    expect(() =>
      dashboardPeriod(
        { kind: "custom", from: "2026-02-30", to: "2026-03-01" },
        today,
      ),
    ).toThrow(expect.objectContaining({ code: "DASHBOARD_PERIOD_INVALID" }));
    expect(() =>
      dashboardPeriod(
        { kind: "custom", from: "2026-11-02", to: "2026-11-01" },
        today,
      ),
    ).toThrow(expect.objectContaining({ code: "DASHBOARD_PERIOD_INVALID" }));
    // 367 days is more than a year.
    expect(() =>
      dashboardPeriod(
        { kind: "custom", from: "2024-01-01", to: "2025-01-01" },
        today,
      ),
    ).toThrow(expect.objectContaining({ code: "DASHBOARD_PERIOD_INVALID" }));
  });

  it("goes day by day for a week or up to 14 days, else week by week", () => {
    const week = dashboardPeriod({ kind: "this_week" }, "2026-11-13");
    expect(dashboardBucket(week)).toBe("day");
    expect(bucketStarts(week, "day")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
    const fortnight = {
      kind: "custom",
      from: "2026-11-01",
      to: "2026-11-14",
    } as const;
    expect(dashboardBucket(fortnight)).toBe("day");
    expect(dashboardBucket({ ...fortnight, to: "2026-11-15" })).toBe("week");

    // November 2026 starts on a Sunday: its first week began on 26 October.
    const month = dashboardPeriod({ kind: "this_month" }, "2026-11-13");
    expect(dashboardBucket(month)).toBe("week");
    expect(bucketStarts(month, "week")).toEqual([
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
      "2026-11-23",
      "2026-11-30",
    ]);
    expect(bucketStartOf("2026-11-01", "week")).toBe("2026-10-26");
    expect(bucketStartOf("2026-11-01", "day")).toBe("2026-11-01");
  });

  it("measures against the month's target only for a month", () => {
    expect(
      targetMonthOf(dashboardPeriod({ kind: "last_month" }, "2026-11-13")),
    ).toBe("2026-10");
    expect(
      targetMonthOf(dashboardPeriod({ kind: "this_month" }, "2026-11-13")),
    ).toBe("2026-11");
    expect(
      targetMonthOf(dashboardPeriod({ kind: "this_week" }, "2026-11-13")),
    ).toBeNull();
  });

  it("shortens a note to one line of 140 characters", () => {
    expect(shortNote("Called back.\nThey want the drawing.")).toBe(
      "Called back. They want the drawing.",
    );
    const long = shortNote("a".repeat(200));
    expect(long).toHaveLength(140);
    expect(long.endsWith("…")).toBe(true);
  });
});
