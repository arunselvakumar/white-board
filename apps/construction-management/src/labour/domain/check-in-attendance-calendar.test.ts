import { describe, expect, it } from "vitest";

import {
  checkInCalendarDays,
  checkInCalendarPlace,
  type CalendarCheckInEntry,
} from "./check-in-attendance-calendar";

const ZONE = "Asia/Kolkata";

/** An instant on the Company's wall clock (India, UTC+05:30). */
function at(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

function entry(
  action: CalendarCheckInEntry["action"],
  date: string,
  time: string,
  overrides: Partial<CalendarCheckInEntry> = {},
): CalendarCheckInEntry {
  return {
    projectId: "sky",
    action,
    occurredAt: at(date, time),
    attendanceDate: date,
    ...overrides,
  };
}

describe("checkInCalendarPlace (ADR CM-0051 §3)", () => {
  it("counts a Check In to its Check Out", () => {
    expect(
      checkInCalendarPlace(
        "sky",
        [
          entry("check_in", "2026-11-02", "09:00"),
          entry("check_out", "2026-11-02", "18:30"),
        ],
        ZONE,
      ),
    ).toEqual({
      place: { kind: "project", projectId: "sky" },
      status: null,
      checkIn: "09:00",
      checkOut: "18:30",
      workedMinutes: 570,
      overtimeMinutes: 0,
      hoursFrom: "times",
      open: false,
      pending: false,
      heads: null,
    });
  });

  it("adds up two pairs in a day, In the first and Out the last", () => {
    const place = checkInCalendarPlace(
      "sky",
      // Out of order on purpose: entries are paired by when they happened.
      [
        entry("check_out", "2026-11-02", "17:00"),
        entry("check_in", "2026-11-02", "09:00"),
        entry("check_in", "2026-11-02", "14:00"),
        entry("check_out", "2026-11-02", "13:00"),
      ],
      ZONE,
    );
    expect(place).toMatchObject({
      checkIn: "09:00",
      checkOut: "17:00",
      workedMinutes: 240 + 180,
      open: false,
    });
  });

  it("counts a night shift whose Check Out is after midnight", () => {
    const place = checkInCalendarPlace(
      "sky",
      [
        entry("check_in", "2026-11-02", "22:00"),
        entry("check_out", "2026-11-02", "06:00", {
          occurredAt: at("2026-11-03", "06:00"),
        }),
      ],
      ZONE,
    );
    expect(place).toMatchObject({
      checkIn: "22:00",
      checkOut: "06:00",
      workedMinutes: 480,
    });
  });

  it("shows a Check In with no Check Out as open, adding no minutes", () => {
    expect(
      checkInCalendarPlace(
        "sky",
        [entry("check_in", "2026-11-02", "09:00")],
        ZONE,
      ),
    ).toMatchObject({
      checkIn: "09:00",
      checkOut: null,
      workedMinutes: 0,
      open: true,
    });
    expect(
      checkInCalendarPlace(
        "sky",
        [
          entry("check_in", "2026-11-02", "09:00"),
          entry("check_out", "2026-11-02", "13:00"),
          entry("check_in", "2026-11-02", "14:00"),
        ],
        ZONE,
      ),
    ).toMatchObject({
      checkIn: "09:00",
      checkOut: "13:00",
      workedMinutes: 240,
      open: true,
    });
  });

  it("ignores a stray Check Out with no Check In before it, and a second Check In while in", () => {
    expect(
      checkInCalendarPlace(
        "sky",
        [
          entry("check_out", "2026-11-02", "08:00"),
          entry("check_in", "2026-11-02", "09:00"),
          entry("check_in", "2026-11-02", "10:00"),
          entry("check_out", "2026-11-02", "12:00"),
        ],
        ZONE,
      ),
    ).toMatchObject({
      checkIn: "09:00",
      checkOut: "12:00",
      workedMinutes: 180,
    });
    expect(
      checkInCalendarPlace(
        "sky",
        [entry("check_out", "2026-11-02", "18:00")],
        ZONE,
      ),
    ).toBeNull();
  });
});

describe("checkInCalendarDays", () => {
  it("gives each attendance day one place per Project, the night shift on the day it began", () => {
    const days = checkInCalendarDays(
      [
        entry("check_in", "2026-11-02", "09:00"),
        entry("check_out", "2026-11-02", "12:00"),
        entry("check_in", "2026-11-02", "13:00", { projectId: "green" }),
        entry("check_out", "2026-11-02", "17:00", { projectId: "green" }),
        entry("check_in", "2026-11-02", "22:00"),
        entry("check_out", "2026-11-02", "02:00", {
          occurredAt: at("2026-11-03", "02:00"),
        }),
        entry("check_in", "2026-11-03", "09:00"),
      ],
      ZONE,
    );
    expect(days).toHaveLength(2);
    const [second, third] = days;
    expect(second?.date).toBe("2026-11-02");
    expect(
      second?.places.map((p) => [
        p.place,
        p.checkIn,
        p.checkOut,
        p.workedMinutes,
      ]),
    ).toEqual([
      [{ kind: "project", projectId: "sky" }, "09:00", "02:00", 180 + 240],
      [{ kind: "project", projectId: "green" }, "13:00", "17:00", 240],
    ]);
    expect(third).toMatchObject({
      date: "2026-11-03",
      places: [expect.objectContaining({ open: true, workedMinutes: 0 })],
    });
  });

  it("leaves out a day with only a stray Check Out", () => {
    expect(
      checkInCalendarDays([entry("check_out", "2026-11-02", "18:00")], ZONE),
    ).toEqual([]);
  });
});
