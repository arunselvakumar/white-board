import { describe, expect, it } from "vitest";

import {
  addMonths,
  allTimeOf,
  dayStatus,
  lastDayOf,
  monthsBetween,
  type AttendanceDayRow,
  type AttendancePlaceRow,
} from "./person-attendance";

function at(
  projectId: string,
  overrides: Partial<AttendancePlaceRow> = {},
): AttendancePlaceRow {
  return {
    place: { kind: "project", projectId },
    status: null,
    checkIn: null,
    checkOut: null,
    workedMinutes: 0,
    overtimeMinutes: 0,
    hoursFrom: "none",
    open: false,
    pending: false,
    heads: null,
    ...overrides,
  };
}

describe("months", () => {
  it("steps across years both ways", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-11", 3)).toBe("2026-02");
    expect(monthsBetween("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });

  it("knows the last day, leap years included", () => {
    expect(lastDayOf("2028-02")).toBe("2028-02-29");
    expect(lastDayOf("2026-11")).toBe("2026-11-30");
  });
});

describe("dayStatus", () => {
  it("takes the source's own status first", () => {
    expect(
      dayStatus({ date: "2026-11-01", status: "week_off", places: [] }),
    ).toBe("week_off");
  });

  it("takes the better of two Projects", () => {
    const row: AttendanceDayRow = {
      date: "2026-11-02",
      status: null,
      places: [at("a", { status: "absent" }), at("b", { status: "half_day" })],
    };
    expect(dayStatus(row)).toBe("half_day");
  });

  it("is Present for a log or a headcount with no status", () => {
    expect(
      dayStatus({ date: "2026-11-02", status: null, places: [at("a")] }),
    ).toBe("present");
  });
});

describe("allTimeOf", () => {
  it("adds up days worked, hours, head-days and places, leaving out absences", () => {
    const rows: AttendanceDayRow[] = [
      {
        date: "2026-10-01",
        status: null,
        places: [at("a", { status: "present", workedMinutes: 480 })],
      },
      {
        date: "2026-10-02",
        status: null,
        places: [at("a", { status: "absent" })],
      },
      {
        date: "2026-10-03",
        status: null,
        places: [
          at("b", {
            status: "half_day",
            workedMinutes: 240,
            overtimeMinutes: 30,
          }),
        ],
      },
      {
        date: "2026-10-04",
        status: null,
        places: [at("c", { heads: { full: 3, half: 1 } })],
      },
    ];
    expect(allTimeOf(rows)).toEqual({
      firstDay: "2026-10-01",
      lastDay: "2026-10-04",
      daysWorked: 2.5,
      workedMinutes: 720,
      overtimeMinutes: 30,
      headDays: 3.5,
      places: 3,
    });
  });
});
