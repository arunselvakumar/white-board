import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  compareWithFence,
  dayEffect,
  dayKeptNote,
  decideEntry,
  defaultAction,
  personState,
  readDeviceFix,
  sheetKeepsLogTimes,
  timesFromEntries,
  voidReason,
  type CheckInAction,
  type DayBefore,
  type LiveEntry,
} from "./check-in";

const ZONE = "Asia/Kolkata";
const TODAY = "2026-11-14";

/** An instant from an India wall-clock time on a date (UTC+05:30). */
function at(time: string, date: string = TODAY): Date {
  return new Date(`${date}T${time}:00+05:30`);
}

let sequence = 0;
function entry(
  action: CheckInAction,
  time: string,
  date: string = TODAY,
  attendanceDate: string = date,
): LiveEntry {
  sequence += 1;
  return {
    id: `entry-${String(sequence)}`,
    action,
    occurredAt: at(time, date),
    attendanceDate,
  };
}

function codeOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return "no error";
}

describe("personState", () => {
  it("is none with no entry", () => {
    expect(personState(null, at("10:00"), TODAY)).toEqual({ status: "none" });
  });

  it("is in after a Check In, since that time", () => {
    const last = entry("check_in", "10:02");
    expect(personState(last, at("12:00"), TODAY)).toEqual({
      status: "in",
      since: last.occurredAt,
      attendanceDate: TODAY,
    });
  });

  it("is out after today's Check Out", () => {
    const last = entry("check_out", "13:05");
    expect(personState(last, at("13:30"), TODAY)).toEqual({
      status: "out",
      since: last.occurredAt,
    });
  });

  it("is none when the last Check Out was on an earlier day", () => {
    const last = entry("check_out", "17:00", "2026-11-13");
    expect(personState(last, at("09:00"), TODAY)).toEqual({ status: "none" });
  });

  it("keeps a night shift in across midnight", () => {
    const last = entry("check_in", "20:00", "2026-11-13");
    expect(personState(last, at("05:00"), TODAY).status).toBe("in");
  });

  it("stops counting a Check In as open after 16 hours", () => {
    const last = entry("check_in", "08:00", "2026-11-13");
    expect(personState(last, at("23:59", "2026-11-13"), TODAY).status).toBe(
      "in",
    );
    expect(personState(last, at("00:00"), TODAY)).toEqual({ status: "none" });
  });

  it("offers the opposite action first", () => {
    expect(defaultAction({ status: "none" })).toBe("check_in");
    expect(defaultAction({ status: "out", since: at("13:00") })).toBe(
      "check_in",
    );
    expect(
      defaultAction({
        status: "in",
        since: at("10:00"),
        attendanceDate: TODAY,
      }),
    ).toBe("check_out");
  });
});

describe("decideEntry", () => {
  it("records a first Check In on today", () => {
    expect(
      decideEntry({
        action: "check_in",
        last: null,
        now: at("10:00"),
        today: TODAY,
      }),
    ).toEqual({ kind: "record", attendanceDate: TODAY });
  });

  it("refuses a Check Out with nobody in", () => {
    expect(
      codeOf(() =>
        decideEntry({
          action: "check_out",
          last: null,
          now: at("10:00"),
          today: TODAY,
        }),
      ),
    ).toBe("NOT_CHECKED_IN");
    expect(
      codeOf(() =>
        decideEntry({
          action: "check_out",
          last: entry("check_out", "09:00"),
          now: at("10:00"),
          today: TODAY,
        }),
      ),
    ).toBe("NOT_CHECKED_IN");
  });

  it("refuses a second Check In while in", () => {
    expect(
      codeOf(() =>
        decideEntry({
          action: "check_in",
          last: entry("check_in", "10:00"),
          now: at("10:30"),
          today: TODAY,
        }),
      ),
    ).toBe("ALREADY_CHECKED_IN");
  });

  it("answers the same action within two minutes with the entry there", () => {
    const last = entry("check_in", "10:00");
    expect(
      decideEntry({
        action: "check_in",
        last,
        now: new Date(last.occurredAt.getTime() + 119_000),
        today: TODAY,
      }),
    ).toEqual({ kind: "repeat", entryId: last.id, attendanceDate: TODAY });
    expect(
      codeOf(() =>
        decideEntry({
          action: "check_in",
          last,
          now: new Date(last.occurredAt.getTime() + 120_000),
          today: TODAY,
        }),
      ),
    ).toBe("ALREADY_CHECKED_IN");
  });

  it("lets a Check Out follow a Check In straight away", () => {
    const last = entry("check_in", "10:00");
    expect(
      decideEntry({
        action: "check_out",
        last,
        now: new Date(last.occurredAt.getTime() + 5_000),
        today: TODAY,
      }),
    ).toEqual({ kind: "record", attendanceDate: TODAY });
  });

  it("answers a repeated night-shift Check Out with the day it was put on", () => {
    const last = entry("check_out", "05:00", TODAY, "2026-11-13");
    expect(
      decideEntry({
        action: "check_out",
        last,
        now: new Date(last.occurredAt.getTime() + 30_000),
        today: TODAY,
      }),
    ).toEqual({
      kind: "repeat",
      entryId: last.id,
      attendanceDate: "2026-11-13",
    });
  });

  it("puts a Check Out after midnight on the day the Check In began", () => {
    expect(
      decideEntry({
        action: "check_out",
        last: entry("check_in", "20:00", "2026-11-13"),
        now: at("05:00"),
        today: TODAY,
      }),
    ).toEqual({ kind: "record", attendanceDate: "2026-11-13" });
  });

  it("starts a new day after a Check In left open for 16 hours", () => {
    const stale = entry("check_in", "08:00", "2026-11-13");
    expect(
      decideEntry({
        action: "check_in",
        last: stale,
        now: at("08:00"),
        today: TODAY,
      }),
    ).toEqual({ kind: "record", attendanceDate: TODAY });
    expect(
      codeOf(() =>
        decideEntry({
          action: "check_out",
          last: stale,
          now: at("08:00"),
          today: TODAY,
        }),
      ),
    ).toBe("NOT_CHECKED_IN");
  });
});

describe("timesFromEntries", () => {
  it("is null without a Check In", () => {
    expect(timesFromEntries([], ZONE)).toBeNull();
    expect(timesFromEntries([entry("check_out", "13:00")], ZONE)).toBeNull();
  });

  it("has an In and the default break while the Labour is in", () => {
    expect(timesFromEntries([entry("check_in", "10:02")], ZONE)).toEqual({
      checkIn: "10:02",
      checkOut: null,
      breakMinutes: 60,
    });
  });

  it("takes the default break off a straight day", () => {
    expect(
      timesFromEntries(
        [entry("check_in", "09:00"), entry("check_out", "18:00")],
        ZONE,
      ),
    ).toEqual({ checkIn: "09:00", checkOut: "18:00", breakMinutes: 60 });
  });

  it("takes no break off a day of an hour or less", () => {
    expect(
      timesFromEntries(
        [entry("check_in", "09:00"), entry("check_out", "10:00")],
        ZONE,
      ),
    ).toEqual({ checkIn: "09:00", checkOut: "10:00", breakMinutes: 0 });
    expect(
      timesFromEntries(
        [entry("check_in", "09:00"), entry("check_out", "10:01")],
        ZONE,
      )?.breakMinutes,
    ).toBe(60);
  });

  it("uses the real gap as the break", () => {
    // In at 10, out for lunch at 1, back at 1:45, out at 5.
    const day = [
      entry("check_in", "10:00"),
      entry("check_out", "13:00"),
      entry("check_in", "13:45"),
      entry("check_out", "17:00"),
    ];
    expect(timesFromEntries(day.slice(0, 2), ZONE)).toEqual({
      checkIn: "10:00",
      checkOut: "13:00",
      breakMinutes: 60,
    });
    expect(timesFromEntries(day.slice(0, 3), ZONE)).toEqual({
      checkIn: "10:00",
      checkOut: null,
      breakMinutes: 45,
    });
    expect(timesFromEntries(day, ZONE)).toEqual({
      checkIn: "10:00",
      checkOut: "17:00",
      breakMinutes: 45,
    });
  });

  it("adds several gaps together", () => {
    expect(
      timesFromEntries(
        [
          entry("check_in", "08:00"),
          entry("check_out", "10:00"),
          entry("check_in", "10:15"),
          entry("check_out", "13:00"),
          entry("check_in", "14:00"),
          entry("check_out", "18:00"),
        ],
        ZONE,
      ),
    ).toEqual({ checkIn: "08:00", checkOut: "18:00", breakMinutes: 75 });
  });

  it("caps the break at 720 minutes", () => {
    expect(
      timesFromEntries(
        [
          entry("check_in", "06:00"),
          entry("check_out", "07:00"),
          entry("check_in", "20:00"),
          entry("check_out", "22:00"),
        ],
        ZONE,
      ),
    ).toEqual({ checkIn: "06:00", checkOut: "22:00", breakMinutes: 720 });
  });

  it("reads a night shift's Out as a time on the next day", () => {
    expect(
      timesFromEntries(
        [
          entry("check_in", "20:00", "2026-11-13"),
          entry("check_out", "05:00", TODAY, "2026-11-13"),
        ],
        ZONE,
      ),
    ).toEqual({ checkIn: "20:00", checkOut: "05:00", breakMinutes: 60 });
  });

  it("skips entries that cannot follow each other after a void", () => {
    // The Check Out at 13:00 was voided: two Check Ins in a row.
    expect(
      timesFromEntries(
        [
          entry("check_in", "10:00"),
          entry("check_in", "14:00"),
          entry("check_out", "17:00"),
        ],
        ZONE,
      ),
    ).toEqual({ checkIn: "10:00", checkOut: "17:00", breakMinutes: 60 });
    // The Check In at 14:00 was voided: two Check Outs in a row.
    expect(
      timesFromEntries(
        [
          entry("check_in", "10:00"),
          entry("check_out", "13:00"),
          entry("check_out", "17:00"),
        ],
        ZONE,
      ),
    ).toEqual({ checkIn: "10:00", checkOut: "13:00", breakMinutes: 60 });
  });

  it("leaves the Out for the sheet when In and Out fall in the same minute", () => {
    const first = entry("check_in", "10:00");
    expect(
      timesFromEntries(
        [
          first,
          {
            action: "check_out",
            occurredAt: new Date(first.occurredAt.getTime() + 20_000),
          },
        ],
        ZONE,
      ),
    ).toEqual({ checkIn: "10:00", checkOut: null, breakMinutes: 60 });
  });

  it("leaves the Out for the sheet when a clock set back shows the In's time again", () => {
    // New York, 1 Nov 2026: 01:30 comes twice, an hour apart.
    expect(
      timesFromEntries(
        [
          { action: "check_in", occurredAt: new Date("2026-11-01T05:30:00Z") },
          { action: "check_out", occurredAt: new Date("2026-11-01T06:30:00Z") },
        ],
        "America/New_York",
      ),
    ).toEqual({ checkIn: "01:30", checkOut: null, breakMinutes: 60 });
  });

  it("leaves the Out for the sheet when In to Out is a day or more", () => {
    expect(
      timesFromEntries(
        [
          entry("check_in", "08:00", "2026-11-13"),
          entry("check_out", "12:00", "2026-11-13"),
          entry("check_in", "23:00", "2026-11-13"),
          entry("check_out", "09:00", TODAY, "2026-11-13"),
        ],
        ZONE,
      ),
    ).toEqual({ checkIn: "08:00", checkOut: null, breakMinutes: 660 });
  });
});

describe("dayEffect", () => {
  const times = { checkIn: "10:00", checkOut: null, breakMinutes: 60 };
  const day = (over: Partial<DayBefore> = {}): DayBefore => ({
    status: "present",
    checkIn: "10:00",
    fromCheckIn: true,
    timesFromCheckIn: true,
    ...over,
  });

  it("creates the day on a Check In when it is not marked", () => {
    expect(dayEffect({ day: null, times, cause: "check_in" })).toEqual({
      kind: "create",
      times,
    });
  });

  it("never creates the day on a Check Out or a void", () => {
    expect(dayEffect({ day: null, times, cause: "check_out" })).toEqual({
      kind: "keep",
      reason: "no_day",
    });
    expect(dayEffect({ day: null, times, cause: "void" })).toEqual({
      kind: "keep",
      reason: "no_day",
    });
    expect(dayEffect({ day: null, times: null, cause: "void" })).toEqual({
      kind: "keep",
      reason: "no_day",
    });
  });

  it("replaces times that follow the log", () => {
    expect(dayEffect({ day: day(), times, cause: "check_out" })).toEqual({
      kind: "set_times",
      times,
    });
  });

  it("fills in times on a Present or Half Day that has none", () => {
    for (const status of ["present", "half_day"] as const)
      expect(
        dayEffect({
          day: day({
            status,
            checkIn: null,
            fromCheckIn: false,
            timesFromCheckIn: false,
          }),
          times,
          cause: "check_in",
        }),
      ).toEqual({ kind: "set_times", times });
  });

  it("keeps times typed on the sheet", () => {
    expect(
      dayEffect({
        day: day({ fromCheckIn: false, timesFromCheckIn: false }),
        times,
        cause: "check_out",
      }),
    ).toEqual({ kind: "keep", reason: "sheet_times" });
  });

  it("keeps a day marked Absent, On Leave or Holiday", () => {
    for (const status of ["absent", "on_leave", "holiday"] as const)
      expect(
        dayEffect({
          day: day({
            status,
            checkIn: null,
            fromCheckIn: false,
            timesFromCheckIn: false,
          }),
          times,
          cause: "check_in",
        }),
      ).toEqual({ kind: "keep", reason: "status" });
  });

  it("clears a day Check-In created when its last entry is voided", () => {
    expect(dayEffect({ day: day(), times: null, cause: "void" })).toEqual({
      kind: "clear",
    });
  });

  it("only removes the times when the sheet has saved the day", () => {
    expect(
      dayEffect({
        day: day({ fromCheckIn: false }),
        times: null,
        cause: "void",
      }),
    ).toEqual({ kind: "set_times", times: null });
  });

  it("leaves a sheet-typed day alone when the last entry is voided", () => {
    expect(
      dayEffect({
        day: day({ fromCheckIn: false, timesFromCheckIn: false }),
        times: null,
        cause: "void",
      }),
    ).toEqual({ kind: "keep", reason: "no_day" });
  });

  it("says why a day was kept", () => {
    expect(dayKeptNote("sheet_times", "present")).toBe(
      "The times typed on the attendance sheet were kept.",
    );
    expect(dayKeptNote("status", "on_leave")).toBe(
      "Marked On Leave on the attendance sheet. Change it there if that is wrong.",
    );
    expect(dayKeptNote("no_day", null)).toBeNull();
  });
});

describe("sheetKeepsLogTimes", () => {
  const before = {
    timesFromCheckIn: true,
    checkIn: "10:00",
    checkOut: "17:00",
    breakMinutes: 45,
  };

  it("keeps following the log when the sheet sends the same times back", () => {
    expect(
      sheetKeepsLogTimes(before, {
        checkIn: "10:00",
        checkOut: "17:00",
        breakMinutes: 45,
      }),
    ).toBe(true);
  });

  it("stops when any of In, Out or the break was typed over", () => {
    expect(
      sheetKeepsLogTimes(before, {
        checkIn: "09:30",
        checkOut: "17:00",
        breakMinutes: 45,
      }),
    ).toBe(false);
    expect(
      sheetKeepsLogTimes(before, {
        checkIn: "10:00",
        checkOut: "18:00",
        breakMinutes: 45,
      }),
    ).toBe(false);
    expect(
      sheetKeepsLogTimes(before, {
        checkIn: "10:00",
        checkOut: "17:00",
        breakMinutes: 60,
      }),
    ).toBe(false);
  });

  it("is false for a new day, a day that did not follow, or no times", () => {
    const same = { checkIn: "10:00", checkOut: "17:00", breakMinutes: 45 };
    expect(sheetKeepsLogTimes(null, same)).toBe(false);
    expect(
      sheetKeepsLogTimes({ ...before, timesFromCheckIn: false }, same),
    ).toBe(false);
    expect(
      sheetKeepsLogTimes(
        { ...before, checkIn: null, checkOut: null, breakMinutes: null },
        { checkIn: null, checkOut: null, breakMinutes: null },
      ),
    ).toBe(false);
  });
});

describe("location", () => {
  // A site in Coimbatore with a 150 m fence.
  const fence = {
    name: "Sky Towers site",
    latitude: 11.0168,
    longitude: 76.9558,
    radiusMetres: 150,
  };

  it("reads no location as none, and refuses half of one", () => {
    expect(readDeviceFix({})).toBeNull();
    expect(readDeviceFix({ latitude: null, longitude: null })).toBeNull();
    expect(codeOf(() => readDeviceFix({ latitude: 11.0168 }))).toBe(
      "LOCATION_INVALID",
    );
    expect(
      codeOf(() => readDeviceFix({ latitude: 91, longitude: 76.9558 })),
    ).toBe("LOCATION_INVALID");
  });

  it("drops an accuracy that is not a distance", () => {
    expect(
      readDeviceFix({
        latitude: 11.0168,
        longitude: 76.9558,
        accuracyMetres: -1,
      }),
    ).toEqual({ latitude: 11.0168, longitude: 76.9558, accuracyMetres: null });
    expect(
      readDeviceFix({
        latitude: 11.0168,
        longitude: 76.9558,
        accuracyMetres: 12.5,
      }),
    ).toEqual({ latitude: 11.0168, longitude: 76.9558, accuracyMetres: 12.5 });
  });

  it("is unmarked without a fence or a location", () => {
    const fix = { latitude: 11.0168, longitude: 76.9558, accuracyMetres: 10 };
    expect(compareWithFence(null, fix)).toBeNull();
    expect(compareWithFence(fence, null)).toBeNull();
  });

  it("is inside at the centre and within the radius", () => {
    expect(
      compareWithFence(fence, {
        latitude: 11.0168,
        longitude: 76.9558,
        accuracyMetres: null,
      }),
    ).toEqual({ outsideFence: false, metresOutside: 0 });
    // 0.001° of latitude is about 111 m.
    expect(
      compareWithFence(fence, {
        latitude: 11.0178,
        longitude: 76.9558,
        accuracyMetres: null,
      }),
    ).toEqual({ outsideFence: false, metresOutside: 0 });
  });

  it("is outside beyond the radius, with the metres outside", () => {
    // About 334 m north: 184 m beyond a 150 m fence.
    const result = compareWithFence(fence, {
      latitude: 11.0198,
      longitude: 76.9558,
      accuracyMetres: null,
    });
    expect(result?.outsideFence).toBe(true);
    expect(result?.metresOutside).toBeGreaterThan(175);
    expect(result?.metresOutside).toBeLessThan(195);
  });

  it("lets the reported accuracy count for at most 50 m", () => {
    // About 189 m north: 39 m beyond the fence.
    const near = { latitude: 11.0185, longitude: 76.9558 };
    expect(
      compareWithFence(fence, { ...near, accuracyMetres: null })?.outsideFence,
    ).toBe(true);
    expect(
      compareWithFence(fence, { ...near, accuracyMetres: 45 })?.outsideFence,
    ).toBe(false);
    // About 334 m north: no accuracy claim brings it inside.
    expect(
      compareWithFence(fence, {
        latitude: 11.0198,
        longitude: 76.9558,
        accuracyMetres: 5_000,
      })?.outsideFence,
    ).toBe(true);
  });
});

describe("voidReason", () => {
  it("trims the reason", () => {
    expect(voidReason("  wrong person  ")).toBe("wrong person");
  });

  it("needs one, of at most 200 characters", () => {
    expect(codeOf(() => voidReason("   "))).toBe("VOID_REASON_REQUIRED");
    expect(codeOf(() => voidReason("x".repeat(201)))).toBe(
      "VOID_REASON_REQUIRED",
    );
    expect(voidReason("x".repeat(200))).toHaveLength(200);
  });
});
