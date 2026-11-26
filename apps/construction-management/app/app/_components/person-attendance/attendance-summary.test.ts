import { describe, expect, it } from "vitest";

import {
  LABOUR_ATTENDANCE,
  SKY_TOWERS,
  VILLA_PHASE_2,
  attendancePage,
  day,
  place,
} from "./person-attendance-fixtures";
import {
  dayLabel,
  dayLevel,
  dayMark,
  formatMinutes,
  monthFigures,
  placeLine,
} from "./attendance-summary";

describe("formatMinutes", () => {
  it("says hours and minutes the short way", () => {
    expect(formatMinutes(480)).toBe("8 h");
    expect(formatMinutes(450)).toBe("7 h 30 m");
    expect(formatMinutes(45)).toBe("45 m");
    expect(formatMinutes(0)).toBe("0 h");
  });
});

describe("monthFigures", () => {
  it("counts days worked, hours, absences and Projects by days", () => {
    const figures = monthFigures([
      day("2026-11-02", "present", [
        place(SKY_TOWERS, { workedMinutes: 270 }),
        place(VILLA_PHASE_2, { workedMinutes: 330, overtimeMinutes: 120 }),
      ]),
      day("2026-11-03", "present", [place(SKY_TOWERS)]),
      day("2026-11-07", "half_day", [
        place(SKY_TOWERS, { status: "half_day", workedMinutes: 240 }),
      ]),
      day("2026-11-04", "absent", [
        place(SKY_TOWERS, {
          status: "absent",
          workedMinutes: 0,
          hoursFrom: "none",
        }),
      ]),
      day("2026-11-05", "paid_leave", [
        place(SKY_TOWERS, {
          status: "paid_leave",
          workedMinutes: 0,
          hoursFrom: "none",
        }),
      ]),
    ]);
    expect(figures).toMatchObject({
      daysWorked: 2.5,
      fullDays: 2,
      halfDays: 1,
      workedMinutes: 1320,
      overtimeMinutes: 120,
      averageMinutes: 440,
      absent: 1,
      leave: 0,
      paidLeave: 1,
    });
    expect(figures.places.map((p) => [p.name, p.days])).toEqual([
      ["Sky Towers", 3],
      ["Villa Phase 2", 1],
    ]);
  });
});

describe("dayLevel", () => {
  it("steps hours at 4, 8 and 10", () => {
    const at = (minutes: number) =>
      dayLevel(
        day("2026-11-02", "present", [
          place(SKY_TOWERS, { workedMinutes: minutes }),
        ]),
        "hours",
        0,
      );
    expect([at(120), at(300), at(480), at(600)]).toEqual([1, 2, 3, 4]);
    expect(dayLevel(undefined, "hours", 0)).toBe(0);
  });

  it("puts head-days in quarters of the most", () => {
    const heads = (full: number) =>
      dayLevel(
        day("2026-11-02", "present", [
          place(SKY_TOWERS, { heads: { full, half: 0, headDays: full } }),
        ]),
        "head_days",
        20,
      );
    expect([heads(2), heads(8), heads(14), heads(20)]).toEqual([1, 2, 3, 4]);
  });
});

describe("dayMark and the label", () => {
  it("marks absence and leave, and reads a two-Project day out loud", () => {
    expect(dayMark(day("2026-11-04", "absent", []))).toBe("absent");
    expect(dayMark(day("2026-11-04", "on_leave", []))).toBe("leave");
    // Absent by the HRMS rule only because the entry awaits approval.
    expect(
      dayMark(
        day("2026-11-04", "absent", [
          place(SKY_TOWERS, { workedMinutes: 0, pending: true }),
        ]),
      ),
    ).toBeNull();
    const twoProjects = day("2026-11-02", "present", [
      place(SKY_TOWERS, {
        checkIn: "08:30",
        checkOut: "13:00",
        workedMinutes: 270,
      }),
      place(VILLA_PHASE_2, {
        checkIn: "14:00",
        checkOut: "19:30",
        workedMinutes: 330,
        overtimeMinutes: 120,
      }),
    ]);
    expect(dayLabel("2026-11-02", twoProjects, "hours")).toBe(
      "Mon, 2 Nov 2026: Present, 10 h. Sky Towers, 4 h 30 m, 8:30 am – 1:00 pm; Villa Phase 2, 5 h 30 m, 2:00 pm – 7:30 pm, Overtime 2 h",
    );
  });

  it("says when a day had no times", () => {
    expect(
      placeLine(
        place(SKY_TOWERS, {
          checkIn: null,
          checkOut: null,
          hoursFrom: "working_hours",
        }),
      ).detail,
    ).toEqual(["No times recorded"]);
  });
});

describe("the fixtures page like the route", () => {
  it("serves six months, then earlier pages down to the first month", () => {
    const first = attendancePage(LABOUR_ATTENDANCE, null);
    expect(first.months.map((m) => m.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    expect(first.earlierTo).toBe("2026-05");
    const second = attendancePage(LABOUR_ATTENDANCE, "2026-05");
    expect(second.months[0]?.month).toBe("2025-12");
    expect(second.earlierTo).toBeNull();
    expect(second.allTime).toBeNull();
  });
});
