import { describe, expect, it } from "vitest";

import {
  NO_FENCE_PLACE,
  calendarStatus,
  hrmsCalendarDay,
  hrmsCalendarPlaces,
  type CalendarEntry,
} from "./attendance-calendar";
import { instantAt } from "./company-time";

const IST = "Asia/Kolkata";
const DATE = "2026-11-10";
const HEAD_OFFICE = { id: "b-ho", name: "Head Office", projectId: null };
const SKY_SITE = { id: "b-sky", name: "Sky gate", projectId: "p-sky" };
const SKY_SITE_2 = { id: "b-sky-2", name: "Sky yard", projectId: "p-sky" };

function entry(
  from: string,
  to: string | null,
  overrides: Partial<CalendarEntry> = {},
): CalendarEntry {
  return {
    checkInAt: instantAt(DATE, from, IST),
    checkOutAt: to == null ? null : instantAt(DATE, to, IST),
    approvalStatus: "none",
    branch: HEAD_OFFICE,
    ...overrides,
  };
}

describe("hrmsCalendarPlaces (ADR CM-0051 §3, Office Staff)", () => {
  it("adds up closed entries by the branch checked in at, In first and Out last", () => {
    const places = hrmsCalendarPlaces(
      [
        entry("14:00", "18:30", { branch: SKY_SITE }),
        entry("09:00", "13:00"),
        entry("18:45", "19:15"),
      ],
      0,
      IST,
    );
    expect(places).toEqual([
      {
        place: { kind: "branch", branchId: "b-ho", name: "Head Office" },
        status: null,
        checkIn: "09:00",
        checkOut: "19:15",
        workedMinutes: 270,
        overtimeMinutes: 0,
        hoursFrom: "times",
        open: false,
        pending: false,
        heads: null,
      },
      expect.objectContaining({
        place: { kind: "project", projectId: "p-sky" },
        checkIn: "14:00",
        checkOut: "18:30",
        workedMinutes: 270,
      }),
    ]);
  });

  it("makes one Project of its sites", () => {
    const places = hrmsCalendarPlaces(
      [
        entry("09:00", "11:00", { branch: SKY_SITE }),
        entry("12:00", "13:00", { branch: SKY_SITE_2 }),
      ],
      0,
      IST,
    );
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      place: { kind: "project", projectId: "p-sky" },
      workedMinutes: 180,
    });
  });

  it("puts an entry that matched no fence on one stable place", () => {
    const places = hrmsCalendarPlaces(
      [entry("09:00", "10:00", { branch: null })],
      0,
      IST,
    );
    expect(places[0]?.place).toEqual(NO_FENCE_PLACE);
    expect(NO_FENCE_PLACE.branchId).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
  });

  it("shows a pending entry with no hours", () => {
    const [place] = hrmsCalendarPlaces(
      [entry("09:00", "18:00", { approvalStatus: "pending" })],
      0,
      IST,
    );
    expect(place).toMatchObject({
      pending: true,
      open: false,
      workedMinutes: 0,
      checkIn: "09:00",
      checkOut: "18:00",
    });
  });

  it("counts an approved entry", () => {
    const [place] = hrmsCalendarPlaces(
      [entry("09:00", "18:00", { approvalStatus: "approved" })],
      0,
      IST,
    );
    expect(place).toMatchObject({ pending: false, workedMinutes: 540 });
  });

  it("shows an open entry with no Out and no hours for it", () => {
    const [place] = hrmsCalendarPlaces(
      [entry("09:00", "13:00"), entry("14:00", null)],
      0,
      IST,
    );
    expect(place).toMatchObject({
      open: true,
      checkIn: "09:00",
      checkOut: null,
      workedMinutes: 240,
    });
  });

  it("leaves rejected entries out", () => {
    expect(
      hrmsCalendarPlaces(
        [entry("09:00", "18:00", { approvalStatus: "rejected" })],
        0,
        IST,
      ),
    ).toEqual([]);
  });

  it("puts the day's overtime on the place with the most minutes", () => {
    const places = hrmsCalendarPlaces(
      [entry("08:00", "10:00"), entry("10:30", "20:00", { branch: SKY_SITE })],
      3.5,
      IST,
    );
    expect(places.map((place) => place.overtimeMinutes)).toEqual([0, 210]);
  });

  it("drops overtime when no place has minutes", () => {
    const places = hrmsCalendarPlaces(
      [entry("09:00", "18:00", { approvalStatus: "pending" })],
      2,
      IST,
    );
    expect(places[0]?.overtimeMinutes).toBe(0);
  });
});

describe("hrmsCalendarDay", () => {
  const rule = {
    date: DATE,
    status: "present" as const,
    leave: null,
    overtimeHours: 0,
  };

  it("keeps the HRMS day status, with paid leave as Paid Leave", () => {
    expect(calendarStatus(rule)).toBe("present");
    expect(calendarStatus({ ...rule, status: "week_off" })).toBe("week_off");
    expect(calendarStatus({ ...rule, status: "holiday" })).toBe("holiday");
    expect(calendarStatus({ ...rule, status: "absent" })).toBe("absent");
    expect(
      calendarStatus({ ...rule, status: "on_leave", leave: { paid: true } }),
    ).toBe("paid_leave");
    expect(
      calendarStatus({ ...rule, status: "on_leave", leave: { paid: false } }),
    ).toBe("on_leave");
  });

  it("is a day with no places when nothing was entered", () => {
    expect(hrmsCalendarDay({ ...rule, status: "absent" }, [], IST)).toEqual({
      date: DATE,
      status: "absent",
      places: [],
    });
  });
});
