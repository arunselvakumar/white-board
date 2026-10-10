import { describe, expect, it } from "vitest";

import { countBuckets, dashboardBucket, dayWiseTrend } from "./dashboard";

describe("HRMS dashboard counting (CM-319)", () => {
  it("keeps a holiday, a week off and leave whatever was worked", () => {
    expect(dashboardBucket("holiday", "checked_out")).toBe("holiday");
    expect(dashboardBucket("week_off", "checked_in")).toBe("week_off");
    expect(dashboardBucket("on_leave", "checked_in")).toBe("on_leave");
  });

  it("counts a member checked in now as present, today only", () => {
    expect(dashboardBucket("absent", "checked_in")).toBe("present");
    expect(dashboardBucket("absent", "not_checked_in")).toBe("absent");
    // Checked out: the hours decide.
    expect(dashboardBucket("half_day", "checked_out")).toBe("half_day");
    expect(dashboardBucket("absent", "checked_out")).toBe("absent");
    // A past day has no live state.
    expect(dashboardBucket("absent")).toBe("absent");
    expect(dashboardBucket("present")).toBe("present");
  });

  it("puts every member in exactly one bucket", () => {
    expect(
      countBuckets([
        "present",
        "present",
        "half_day",
        "absent",
        "on_leave",
        "holiday",
        "week_off",
      ]),
    ).toEqual({
      present: 2,
      halfDay: 1,
      absent: 1,
      onLeave: 1,
      holiday: 1,
      weekOff: 1,
    });
  });

  it("counts each date of the trend, refining only today by the live state", () => {
    const trend = dayWiseTrend({
      dates: ["2026-10-09", "2026-10-10"],
      daysByMember: new Map([
        [
          "m1",
          [
            { date: "2026-10-09", status: "absent" },
            { date: "2026-10-10", status: "absent" },
          ],
        ],
        [
          "m2",
          [
            // Outside the dates: ignored.
            { date: "2026-10-08", status: "present" },
            { date: "2026-10-09", status: "on_leave" },
            { date: "2026-10-10", status: "absent" },
          ],
        ],
      ]),
      today: "2026-10-10",
      // m1 is checked in now; on 9 October the same state would not count.
      liveToday: new Map([
        ["m1", "checked_in"],
        ["m2", "not_checked_in"],
      ]),
    });
    expect(trend).toEqual([
      {
        date: "2026-10-09",
        present: 0,
        halfDay: 0,
        absent: 1,
        onLeave: 1,
        holiday: 0,
        weekOff: 0,
      },
      {
        date: "2026-10-10",
        present: 1,
        halfDay: 0,
        absent: 1,
        onLeave: 0,
        holiday: 0,
        weekOff: 0,
      },
    ]);
  });
});
