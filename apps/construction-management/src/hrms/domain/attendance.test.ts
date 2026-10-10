import { describe, expect, it } from "vitest";

import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertCanCheckOut,
  assertCanDecide,
  assertMissedCheckout,
  assertNoOverlap,
  attendanceDateOf,
  attendanceDay,
  canCheckOutNow,
  countDays,
  decideCheckIn,
  hoursBetween,
  liveState,
  manualEntryTimes,
  readGpsFix,
  readReason,
  type DayEntry,
  type DayShift,
  type EntryFacts,
} from "./attendance";
import type { Fence } from "./branch";
import { instantAt, localDateTime } from "./company-time";

const IST = "Asia/Kolkata";

const OFFICE: Fence = {
  id: "office",
  kind: "office_branch",
  name: "Chennai HO",
  projectId: null,
  latitude: 13.0827,
  longitude: 80.2707,
  radiusMetres: 100,
};
const SITE: Fence = {
  id: "site",
  kind: "project_site",
  name: "Tower A gate",
  projectId: "p1",
  latitude: 13.1,
  longitude: 80.3,
  radiusMetres: 200,
};

const INSIDE = { latitude: 13.0827, longitude: 80.2707, accuracyMetres: 10 };
/** About 1.1 km north of the office. */
const OUTSIDE = { latitude: 13.0927, longitude: 80.2707, accuracyMetres: 10 };

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  return undefined;
}

function errorOf(run: () => unknown): DomainError {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("Expected a DomainError");
}

const at = (date: string, time: string) => instantAt(date, time, IST);

describe("GPS check-in (ADR CM-0012 §1, §3)", () => {
  it("reads a location: both coordinates or none, in range", () => {
    expect(readGpsFix({})).toBeNull();
    expect(
      readGpsFix({
        latitude: 13.08271234,
        longitude: 80.2707,
        accuracyMetres: 12.345,
      }),
    ).toEqual({
      latitude: 13.082712,
      longitude: 80.2707,
      accuracyMetres: 12.35,
    });
    expect(errorOf(() => readGpsFix({ latitude: 13 })).details).toEqual({
      field: "longitude",
    });
    expect(codeOf(() => readGpsFix({ latitude: 91, longitude: 1 }))).toBe(
      "LOCATION_INVALID",
    );
    expect(
      codeOf(() =>
        readGpsFix({ latitude: 1, longitude: 1, accuracyMetres: -1 }),
      ),
    ).toBe("LOCATION_INVALID");
  });

  it("takes no location when GPS is disabled", () => {
    expect(decideCheckIn("disabled", [], null)).toEqual({
      branchId: null,
      outOfFence: false,
      approvalStatus: "none",
    });
    expect(decideCheckIn("disabled", [OFFICE], INSIDE).branchId).toBe("office");
  });

  it("needs no approval inside a fence and matches the nearest", () => {
    for (const gps of ["record_only", "required"] as const)
      expect(decideCheckIn(gps, [SITE, OFFICE], INSIDE)).toEqual({
        branchId: "office",
        outOfFence: false,
        approvalStatus: "none",
      });
  });

  it("sends a record-only check-in outside every fence to approvals", () => {
    const pending = {
      branchId: null,
      outOfFence: true,
      approvalStatus: "pending",
    };
    expect(decideCheckIn("record_only", [OFFICE], OUTSIDE)).toEqual(pending);
    expect(decideCheckIn("record_only", [OFFICE], null)).toEqual(pending);
    expect(decideCheckIn("record_only", [], INSIDE)).toEqual(pending);
  });

  it("refuses a required check-in outside, with no fence or no location", () => {
    const outside = errorOf(() => decideCheckIn("required", [OFFICE], OUTSIDE));
    expect(outside.code).toBe("OUTSIDE_FENCE");
    expect(outside.kind).toBe("invalid");
    expect(outside.details).toMatchObject({
      field: "location",
      nearestFence: "Chennai HO",
    });
    const none = errorOf(() => decideCheckIn("required", [], INSIDE));
    expect(none.code).toBe("OFFICE_LOCATION_NOT_CONFIGURED");
    expect(none.kind).toBe("conflict");
    expect(codeOf(() => decideCheckIn("required", [OFFICE], null))).toBe(
      "LOCATION_REQUIRED",
    );
  });

  it("lets the device's accuracy (capped at 50 m) count", () => {
    // ~111 m north: 11 m outside the 100 m fence.
    const edge = { latitude: 13.0837, longitude: 80.2707 };
    expect(
      decideCheckIn("required", [OFFICE], { ...edge, accuracyMetres: 20 })
        .branchId,
    ).toBe("office");
    expect(
      codeOf(() =>
        decideCheckIn("required", [OFFICE], { ...edge, accuracyMetres: 5 }),
      ),
    ).toBe("OUTSIDE_FENCE");
  });
});

describe("the attendance date of a check-in", () => {
  const night = { startTime: "22:00", endTime: "06:00" };
  const day = { startTime: "09:00", endTime: "18:00" };

  it("is the Company date, or last night's for a midnight-crossing shift", () => {
    const early = localDateTime(at("2026-10-10", "02:00"), IST);
    expect(attendanceDateOf(early, night)).toBe("2026-10-09");
    expect(attendanceDateOf(early, day)).toBe("2026-10-10");
    expect(attendanceDateOf(early, null)).toBe("2026-10-10");
    const morning = localDateTime(at("2026-10-10", "07:00"), IST);
    expect(attendanceDateOf(morning, night)).toBe("2026-10-10");
  });
});

function entry(overrides: Partial<EntryFacts> = {}): EntryFacts {
  return {
    id: "e1",
    memberId: "m1",
    date: "2026-10-09",
    checkInAt: at("2026-10-09", "09:00"),
    checkOutAt: null,
    approvalStatus: "none",
    ...overrides,
  };
}

describe("check-out and the missed checkout", () => {
  it("closes today's entry and computes its hours", () => {
    const out = at("2026-10-09", "17:30");
    expect(() => {
      assertCanCheckOut(entry(), out, localDateTime(out, IST), null);
    }).not.toThrow();
    expect(hoursBetween(entry().checkInAt, out)).toBe(8.5);
  });

  it("closes last night's entry of a midnight-crossing shift", () => {
    const night = entry({ checkInAt: at("2026-10-09", "22:00") });
    const out = at("2026-10-10", "06:10");
    const shift = { startTime: "22:00", endTime: "06:00" };
    expect(canCheckOutNow(night, out, localDateTime(out, IST), shift)).toBe(
      true,
    );
    expect(canCheckOutNow(night, out, localDateTime(out, IST), null)).toBe(
      false,
    );
  });

  it("refuses to check out an entry left open on an earlier day", () => {
    const out = at("2026-10-10", "09:00");
    expect(
      codeOf(() => {
        assertCanCheckOut(entry(), out, localDateTime(out, IST), null);
      }),
    ).toBe("ATTENDANCE_OPEN_FROM_EARLIER_DAY");
    const closed = entry({ checkOutAt: at("2026-10-09", "18:00") });
    expect(
      codeOf(() => {
        assertCanCheckOut(closed, out, localDateTime(out, IST), null);
      }),
    ).toBe("ATTENDANCE_NOT_OPEN");
  });

  it("allows a missed checkout only for an earlier day, after check-in, within 24 h, not in the future", () => {
    const now = at("2026-10-10", "10:00");
    expect(() => {
      assertMissedCheckout(
        entry(),
        at("2026-10-09", "18:00"),
        now,
        "2026-10-10",
      );
    }).not.toThrow();
    expect(
      codeOf(() => {
        assertMissedCheckout(
          entry({ date: "2026-10-10", checkInAt: at("2026-10-10", "09:00") }),
          at("2026-10-10", "09:30"),
          now,
          "2026-10-10",
        );
      }),
    ).toBe("MISSED_CHECKOUT_NOT_NEEDED");
    expect(
      errorOf(() => {
        assertMissedCheckout(
          entry(),
          at("2026-10-09", "08:00"),
          now,
          "2026-10-10",
        );
      }).details,
    ).toEqual({ field: "checkOutTime" });
    expect(
      codeOf(() => {
        assertMissedCheckout(
          entry(),
          at("2026-10-10", "09:30"),
          now,
          "2026-10-10",
        );
      }),
    ).toBe("CHECK_OUT_TOO_LATE");
    expect(
      codeOf(() => {
        assertMissedCheckout(
          entry({ date: "2026-10-09", checkInAt: at("2026-10-09", "22:00") }),
          at("2026-10-10", "10:30"),
          now,
          "2026-10-10",
        );
      }),
    ).toBe("CHECK_OUT_IN_FUTURE");
    expect(
      codeOf(() => {
        assertMissedCheckout(
          entry({ approvalStatus: "rejected" }),
          at("2026-10-09", "18:00"),
          now,
          "2026-10-10",
        );
      }),
    ).toBe("ATTENDANCE_NOT_OPEN");
  });

  it("needs a reason of 3–500 characters", () => {
    expect(readReason("  Forgot  ")).toBe("Forgot");
    expect(errorOf(() => readReason(" a ")).code).toBe("REASON_REQUIRED");
    expect(errorOf(() => readReason("", "rejectionReason")).details).toEqual({
      field: "rejectionReason",
    });
    expect(codeOf(() => readReason("x".repeat(501)))).toBe("REASON_TOO_LONG");
  });
});

describe("back-dated days (manual entries)", () => {
  it("are for a past date, with valid times; out before in is the next day", () => {
    const day = manualEntryTimes(
      { date: "2026-10-08", checkInTime: "09:00", checkOutTime: "18:00" },
      "2026-10-10",
      IST,
    );
    expect(day.checkInAt.toISOString()).toBe("2026-10-08T03:30:00.000Z");
    expect(hoursBetween(day.checkInAt, day.checkOutAt)).toBe(9);
    const night = manualEntryTimes(
      { date: "2026-10-08", checkInTime: "22:00", checkOutTime: "06:00" },
      "2026-10-10",
      IST,
    );
    expect(hoursBetween(night.checkInAt, night.checkOutAt)).toBe(8);

    const today = errorOf(() =>
      manualEntryTimes(
        { date: "2026-10-10", checkInTime: "09:00", checkOutTime: "18:00" },
        "2026-10-10",
        IST,
      ),
    );
    expect(today.code).toBe("MANUAL_DATE_NOT_PAST");
    expect(today.details).toEqual({ field: "date" });
    expect(
      codeOf(() =>
        manualEntryTimes(
          { date: "2026-10-08", checkInTime: "9am", checkOutTime: "18:00" },
          "2026-10-10",
          IST,
        ),
      ),
    ).toBe("CHECK_IN_TIME_INVALID");
    expect(
      codeOf(() =>
        manualEntryTimes(
          { date: "2026-10-08", checkInTime: "09:00", checkOutTime: "09:00" },
          "2026-10-10",
          IST,
        ),
      ),
    ).toBe("CHECK_OUT_TIME_INVALID");
    expect(
      codeOf(() =>
        manualEntryTimes(
          { date: "2026-02-30", checkInTime: "09:00", checkOutTime: "10:00" },
          "2026-10-10",
          IST,
        ),
      ),
    ).toBe("ENTRY_DATE_INVALID");
  });

  it("may not overlap another entry; an open one runs on; rejected ones do not count", () => {
    const others = [
      {
        id: "a",
        date: "2026-10-08",
        checkInAt: at("2026-10-08", "09:00"),
        checkOutAt: at("2026-10-08", "13:00"),
        approvalStatus: "none" as const,
      },
      {
        id: "b",
        date: "2026-10-08",
        checkInAt: at("2026-10-08", "14:00"),
        checkOutAt: at("2026-10-08", "18:00"),
        approvalStatus: "rejected" as const,
      },
    ];
    // Touching the first entry is fine; the rejected one is ignored.
    expect(() => {
      assertNoOverlap(
        { from: at("2026-10-08", "13:00"), to: at("2026-10-08", "17:00") },
        others,
      );
    }).not.toThrow();
    const overlap = errorOf(() => {
      assertNoOverlap(
        { from: at("2026-10-08", "12:00"), to: at("2026-10-08", "17:00") },
        others,
      );
    });
    expect(overlap.code).toBe("ATTENDANCE_OVERLAP");
    expect(overlap.kind).toBe("conflict");
    expect(overlap.details).toMatchObject({
      field: "checkInTime",
      entryId: "a",
    });
    // Itself is not an overlap.
    expect(() => {
      assertNoOverlap(
        {
          from: at("2026-10-08", "09:00"),
          to: at("2026-10-08", "12:00"),
          exceptId: "a",
        },
        others,
      );
    }).not.toThrow();
    const open = [
      {
        id: "o",
        date: "2026-10-08",
        checkInAt: at("2026-10-08", "09:00"),
        checkOutAt: null,
        approvalStatus: "none" as const,
      },
    ];
    expect(
      codeOf(() => {
        assertNoOverlap(
          { from: at("2026-10-09", "09:00"), to: at("2026-10-09", "17:00") },
          open,
        );
      }),
    ).toBe("ATTENDANCE_OVERLAP");
  });
});

describe("approvals (ADR CM-0012 §5)", () => {
  const pending = entry({ approvalStatus: "pending" });

  it("decides only a pending entry", () => {
    expect(() => {
      assertCanDecide(pending, { memberId: "m2", isOwner: false });
    }).not.toThrow();
    for (const status of ["approved", "rejected", "none"] as const) {
      const error = errorOf(() => {
        assertCanDecide(entry({ approvalStatus: status }), {
          memberId: "m2",
          isOwner: false,
        });
      });
      expect(error.code).toBe("ATTENDANCE_NOT_PENDING");
      expect(error.kind).toBe("conflict");
    }
  });

  it("never lets a member decide their own entry, except the Owner", () => {
    const self = errorOf(() => {
      assertCanDecide(pending, { memberId: "m1", isOwner: false });
    });
    expect(self.code).toBe("ATTENDANCE_SELF_APPROVAL");
    expect(self.kind).toBe("forbidden");
    expect(() => {
      assertCanDecide(pending, { memberId: "m1", isOwner: true });
    }).not.toThrow();
  });
});

const GENERAL: DayShift = {
  startTime: "09:00",
  endTime: "18:00",
  workingHours: 8,
  halfDayHours: 4,
  graceMinutes: 10,
  overtimeAllowed: true,
};
const STANDARD: DayShift = {
  startTime: null,
  endTime: null,
  workingHours: 8,
  halfDayHours: 4,
  graceMinutes: 15,
  overtimeAllowed: false,
};

function worked(
  date: string,
  from: string,
  to: string | null,
  approvalStatus: DayEntry["approvalStatus"] = "none",
): DayEntry {
  return {
    checkInAt: at(date, from),
    checkOutAt: to == null ? null : at(date, to),
    approvalStatus,
  };
}

function day(
  entries: DayEntry[],
  options: {
    kind?: "working" | "week_off" | "holiday";
    shift?: DayShift;
    leave?: { paid: boolean; days: 1 | 0.5 }[];
    date?: string;
  } = {},
) {
  return attendanceDay({
    date: options.date ?? "2026-10-09",
    kind: options.kind ?? "working",
    shift: options.shift ?? GENERAL,
    entries,
    leave: options.leave ?? [],
    timeZone: IST,
  });
}

describe("day status (ADR CM-0012 §2)", () => {
  it("is Present at the working hours, Half Day at the half-day hours, else Absent", () => {
    expect(day([worked("2026-10-09", "09:00", "17:00")]).status).toBe(
      "present",
    );
    expect(
      day([
        worked("2026-10-09", "09:00", "11:00"),
        worked("2026-10-09", "12:00", "14:00"),
      ]),
    ).toMatchObject({ status: "half_day", workedHours: 4 });
    expect(day([worked("2026-10-09", "09:00", "12:59")]).status).toBe("absent");
    expect(day([]).status).toBe("absent");
  });

  it("counts only closed entries that need no approval or are approved", () => {
    const result = day([
      worked("2026-10-09", "09:00", "13:00", "approved"),
      worked("2026-10-09", "13:00", "15:00", "pending"),
      worked("2026-10-09", "15:00", "17:00", "rejected"),
      worked("2026-10-09", "17:00", null),
    ]);
    expect(result).toMatchObject({ workedHours: 4, status: "half_day" });
  });

  it("flags a first check-in after start plus the shift's grace, without changing the status", () => {
    expect(day([worked("2026-10-09", "09:10", "18:00")]).late).toBe(false);
    expect(day([worked("2026-10-09", "09:11", "18:00")])).toMatchObject({
      late: true,
      status: "present",
    });
    // A later rejected entry does not hide an earlier on-time one; a rejected early one does not count.
    expect(
      day([
        worked("2026-10-09", "08:00", "09:00", "rejected"),
        worked("2026-10-09", "09:30", "18:00"),
      ]).late,
    ).toBe(true);
    // The Settings day has no start time.
    expect(
      day([worked("2026-10-09", "11:00", "19:00")], { shift: STANDARD }).late,
    ).toBe(false);
  });

  it("reports overtime beyond the working hours with the shift's eligibility", () => {
    expect(day([worked("2026-10-09", "09:00", "19:30")])).toMatchObject({
      workedHours: 10.5,
      overtimeHours: 2.5,
      overtimeAllowed: true,
      shiftWorkingHours: 8,
    });
    expect(
      day([worked("2026-10-09", "09:00", "19:30")], { shift: STANDARD }),
    ).toMatchObject({ overtimeHours: 2.5, overtimeAllowed: false });
  });

  it("keeps a holiday or week off when worked, every hour overtime", () => {
    expect(
      day([worked("2026-10-09", "10:00", "14:00")], { kind: "holiday" }),
    ).toMatchObject({
      status: "holiday",
      workedHours: 4,
      overtimeHours: 4,
      late: false,
    });
    expect(day([], { kind: "week_off" })).toMatchObject({
      status: "week_off",
      overtimeHours: 0,
    });
  });

  it("is On Leave for approved leave; a half day says how the other half went", () => {
    expect(day([], { leave: [{ paid: true, days: 1 }] })).toMatchObject({
      status: "on_leave",
      leave: { paid: true, half: false, otherHalf: null },
    });
    expect(
      day([worked("2026-10-09", "09:00", "13:30")], {
        leave: [{ paid: false, days: 0.5 }],
      }),
    ).toMatchObject({
      status: "on_leave",
      leave: { paid: false, half: true, otherHalf: "present" },
    });
    expect(day([], { leave: [{ paid: true, days: 0.5 }] }).leave).toEqual({
      paid: true,
      half: true,
      otherHalf: "absent",
    });
    // A holiday wins over leave.
    expect(
      day([], { kind: "holiday", leave: [{ paid: true, days: 1 }] }).status,
    ).toBe("holiday");
  });

  it("dates a midnight-crossing shift's hours on the day it starts", () => {
    const night: DayShift = {
      ...GENERAL,
      startTime: "22:00",
      endTime: "06:00",
    };
    const result = attendanceDay({
      date: "2026-10-09",
      kind: "working",
      shift: night,
      entries: [
        {
          checkInAt: at("2026-10-09", "22:20"),
          checkOutAt: at("2026-10-10", "06:30"),
          approvalStatus: "none",
        },
      ],
      leave: [],
      timeZone: IST,
    });
    expect(result).toMatchObject({
      status: "present",
      workedHours: 8.17,
      late: true,
    });
  });

  it("counts a month in half-day steps", () => {
    const counts = countDays([
      day([worked("2026-10-01", "09:00", "17:00")], { date: "2026-10-01" }),
      day([worked("2026-10-02", "09:30", "13:00")], { date: "2026-10-02" }),
      day([], { date: "2026-10-03", kind: "week_off" }),
      day([], { date: "2026-10-04", kind: "holiday" }),
      day([], { date: "2026-10-05" }),
      day([], { date: "2026-10-06", leave: [{ paid: true, days: 1 }] }),
      day([], { date: "2026-10-07", leave: [{ paid: false, days: 0.5 }] }),
      day([worked("2026-10-08", "09:00", "13:00")], {
        date: "2026-10-08",
        leave: [{ paid: true, days: 0.5 }],
      }),
    ]);
    expect(counts).toEqual({
      workingDays: 6,
      present: 1.5,
      halfDays: 0,
      absent: 2.5,
      paidLeave: 1.5,
      unpaidLeave: 0.5,
      weekOff: 1,
      holidays: 1,
      late: 1,
      workedHours: 15.5,
      overtimeHours: 0,
    });
  });
});

describe("today, live", () => {
  it("is checked in, checked out, a day off or not checked in", () => {
    const base = {
      kind: "working" as const,
      fullDayLeave: false,
      entries: [] as DayEntry[],
      openNow: false,
    };
    expect(liveState({ ...base, openNow: true })).toBe("checked_in");
    expect(
      liveState({
        ...base,
        entries: [worked("2026-10-09", "09:00", "10:00")],
      }),
    ).toBe("checked_out");
    expect(
      liveState({
        ...base,
        entries: [worked("2026-10-09", "09:00", "10:00", "rejected")],
      }),
    ).toBe("not_checked_in");
    expect(liveState({ ...base, kind: "holiday" })).toBe("holiday");
    expect(liveState({ ...base, kind: "week_off" })).toBe("week_off");
    expect(liveState({ ...base, fullDayLeave: true })).toBe("on_leave");
    expect(liveState(base)).toBe("not_checked_in");
  });
});
