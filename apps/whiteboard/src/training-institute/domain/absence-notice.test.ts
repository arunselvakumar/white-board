import { describe, expect, it } from "vitest";

import {
  ABSENCE_NOTE_MAX,
  ABSENCE_REASONS,
  absenceNote,
  absenceReason,
  assertBeforeClassStarts,
  isAbsenceReason,
  noticeableClasses,
  noticeStanding,
} from "./absence-notice";
import type { ClassChangeFact, HolidayFact } from "./class-schedule";
import { DomainError } from "./errors";

const batchId = "batch-1";
// 2026-11-02 is a Monday, 2026-11-04 a Wednesday, 2026-11-05 a Thursday.
const source = {
  batchId,
  timings: [{ daysOfWeek: [1, 3], startTime: "09:00", endTime: "11:00" }],
};
// Monday 2026-11-02, 08:50 local: ten minutes before the Class.
const tenBefore = { date: "2026-11-02", minutes: 8 * 60 + 50 };
const atStart = { date: "2026-11-02", minutes: 9 * 60 };

function change(overrides: Partial<ClassChangeFact>): ClassChangeFact {
  return {
    id: "change-1",
    batchId,
    date: "2026-11-04",
    startTime: "09:00",
    endTime: "11:00",
    kind: "cancelled",
    reason: null,
    movedTo: null,
    ...overrides,
  };
}

const holiday: HolidayFact = {
  id: "holiday-1",
  startDate: "2026-11-09",
  endDate: "2026-11-09",
  reason: "Festival",
};

function keys(classes: { date: string; startTime: string }[]) {
  return classes.map((value) => `${value.date} ${value.startTime}`);
}

function domainCode(work: () => unknown): string | null {
  try {
    work();
    return null;
  } catch (error) {
    return error instanceof DomainError ? error.code : "not a DomainError";
  }
}

describe("noticeableClasses", () => {
  it("includes a Class ten minutes before it starts", () => {
    const classes = noticeableClasses(source, [], [], tenBefore, 7);
    expect(keys(classes)).toEqual([
      "2026-11-02 09:00",
      "2026-11-04 09:00",
      "2026-11-09 09:00",
    ]);
    expect(classes[0]).toEqual({
      batchId,
      date: "2026-11-02",
      startTime: "09:00",
      endTime: "11:00",
      rescheduled: false,
    });
  });

  it("excludes a Class from exactly its start time", () => {
    expect(keys(noticeableClasses(source, [], [], atStart, 7))).toEqual([
      "2026-11-04 09:00",
      "2026-11-09 09:00",
    ]);
  });

  it("excludes past days", () => {
    const wednesdayNoon = { date: "2026-11-04", minutes: 12 * 60 };
    expect(keys(noticeableClasses(source, [], [], wednesdayNoon, 5))).toEqual([
      "2026-11-09 09:00",
    ]);
  });

  it("excludes a Cancelled Class and a Holiday", () => {
    expect(
      keys(noticeableClasses(source, [change({})], [holiday], tenBefore, 9)),
    ).toEqual(["2026-11-02 09:00", "2026-11-11 09:00"]);
  });

  it("offers a Moved Class at its new time, never its original slot", () => {
    const moved = change({
      kind: "moved",
      movedTo: { date: "2026-11-05", startTime: "16:00", endTime: "17:00" },
    });
    const classes = noticeableClasses(source, [moved], [], tenBefore, 7);
    expect(keys(classes)).toEqual([
      "2026-11-02 09:00",
      "2026-11-05 16:00",
      "2026-11-09 09:00",
    ]);
    expect(classes[1]).toMatchObject({ endTime: "17:00", rescheduled: true });
  });

  it("keeps a Moved Class that was moved earlier on the same day in time order", () => {
    const moved = change({
      date: "2026-11-02",
      kind: "moved",
      movedTo: { date: "2026-11-02", startTime: "08:55", endTime: "09:30" },
    });
    expect(keys(noticeableClasses(source, [moved], [], tenBefore, 0))).toEqual([
      "2026-11-02 08:55",
    ]);
  });

  it("stops at the horizon, counting today as day 0", () => {
    expect(keys(noticeableClasses(source, [], [], tenBefore, 2))).toEqual([
      "2026-11-02 09:00",
      "2026-11-04 09:00",
    ]);
    expect(keys(noticeableClasses(source, [], [], tenBefore, 1))).toEqual([
      "2026-11-02 09:00",
    ]);
  });

  it("looks 60 days ahead by default", () => {
    const classes = noticeableClasses(source, [], [], tenBefore);
    expect(classes.at(-1)?.date).toBe("2026-12-30");
    expect(classes.every((value) => value.date <= "2027-01-01")).toBe(true);
  });

  it("starts from the Enrollment's first date", () => {
    expect(
      keys(
        noticeableClasses(
          { ...source, firstDate: "2026-11-03" },
          [],
          [],
          tenBefore,
          7,
        ),
      ),
    ).toEqual(["2026-11-04 09:00", "2026-11-09 09:00"]);
  });
});

describe("noticeStanding", () => {
  const key = { date: "2026-11-04", startTime: "09:00" };

  it("applies while the Class is still scheduled", () => {
    expect(noticeStanding(source, key, [], [])).toEqual({ status: "applies" });
  });

  it("no longer applies to a Cancelled Class", () => {
    expect(noticeStanding(source, key, [change({})], [])).toEqual({
      status: "cancelled",
    });
  });

  it("no longer applies on a Holiday", () => {
    expect(
      noticeStanding(
        source,
        { date: "2026-11-09", startTime: "09:00" },
        [],
        [holiday],
      ),
    ).toEqual({ status: "holiday" });
  });

  it("no longer applies to a Moved Class, and says where it went", () => {
    const movedTo = {
      date: "2026-11-05",
      startTime: "16:00",
      endTime: "17:00",
    };
    expect(
      noticeStanding(source, key, [change({ kind: "moved", movedTo })], []),
    ).toEqual({ status: "moved", movedTo });
  });

  it("applies to the new time of a Moved Class", () => {
    const movedTo = {
      date: "2026-11-05",
      startTime: "16:00",
      endTime: "17:00",
    };
    expect(
      noticeStanding(
        source,
        { date: "2026-11-05", startTime: "16:00" },
        [change({ kind: "moved", movedTo })],
        [],
      ),
    ).toEqual({ status: "applies" });
  });

  it("no longer applies to a Moved Class's new time once the move is undone", () => {
    expect(
      noticeStanding(
        source,
        { date: "2026-11-05", startTime: "16:00" },
        [],
        [],
      ),
    ).toEqual({ status: "not_scheduled" });
  });

  it("applies again when a Cancelled Class is restored", () => {
    expect(noticeStanding(source, key, [change({})], [])).toEqual({
      status: "cancelled",
    });
    expect(noticeStanding(source, key, [], [])).toEqual({ status: "applies" });
  });

  it("is not scheduled when the Timings no longer have that Class", () => {
    expect(
      noticeStanding(
        source,
        { date: "2026-11-04", startTime: "10:00" },
        [],
        [],
      ),
    ).toEqual({ status: "not_scheduled" });
  });
});

describe("reason and note", () => {
  it("accepts each reason and refuses anything else", () => {
    for (const reason of ABSENCE_REASONS) {
      expect(isAbsenceReason(reason)).toBe(true);
      expect(absenceReason(reason)).toBe(reason);
    }
    expect(isAbsenceReason("")).toBe(false);
    expect(domainCode(() => absenceReason(""))).toBe(
      "ABSENCE_NOTICE_REASON_REQUIRED",
    );
    expect(domainCode(() => absenceReason("holiday"))).toBe(
      "ABSENCE_NOTICE_REASON_REQUIRED",
    );
  });

  it("trims the note and treats blank as none", () => {
    expect(absenceNote(undefined)).toBeNull();
    expect(absenceNote(null)).toBeNull();
    expect(absenceNote("   ")).toBeNull();
    expect(absenceNote("  Cousin's wedding ")).toBe("Cousin's wedding");
  });

  it("allows up to 300 characters", () => {
    expect(absenceNote("a".repeat(ABSENCE_NOTE_MAX))).toHaveLength(300);
    expect(absenceNote(` ${"a".repeat(ABSENCE_NOTE_MAX)} `)).toHaveLength(300);
    expect(domainCode(() => absenceNote("a".repeat(301)))).toBe(
      "ABSENCE_NOTICE_NOTE_TOO_LONG",
    );
  });
});

describe("assertBeforeClassStarts", () => {
  const key = { date: "2026-11-02", startTime: "09:00" };

  it("allows ten minutes before and refuses from the start time", () => {
    expect(
      domainCode(() => assertBeforeClassStarts(key, tenBefore)),
    ).toBeNull();
    expect(domainCode(() => assertBeforeClassStarts(key, atStart))).toBe(
      "ABSENCE_NOTICE_CLASS_STARTED",
    );
    expect(
      domainCode(() =>
        assertBeforeClassStarts(key, { date: "2026-11-03", minutes: 0 }),
      ),
    ).toBe("ABSENCE_NOTICE_CLASS_STARTED");
  });
});
