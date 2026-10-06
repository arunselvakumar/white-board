import { describe, expect, it } from "vitest";

import {
  classAt,
  classesOn,
  hasStarted,
  holidayOn,
  type ClassChangeFact,
  type HolidayFact,
} from "./class-schedule";

const batchId = "batch-1";
// 2026-11-02 is a Monday, 2026-11-04 a Wednesday, 2026-11-07 a Saturday.
const source = {
  batchId,
  timings: [{ daysOfWeek: [1, 3], startTime: "09:00", endTime: "11:00" }],
};

function change(overrides: Partial<ClassChangeFact>): ClassChangeFact {
  return {
    id: "change-1",
    batchId,
    date: "2026-11-02",
    startTime: "09:00",
    endTime: "11:00",
    kind: "cancelled",
    reason: null,
    movedTo: null,
    ...overrides,
  };
}

const diwali: HolidayFact = {
  id: "holiday-1",
  startDate: "2026-11-09",
  endDate: "2026-11-11",
  reason: "Diwali",
};

describe("classesOn", () => {
  it("repeats weekly Timings when nothing has changed", () => {
    expect(classesOn(source, "2026-11-02", [], [])).toEqual([
      expect.objectContaining({
        date: "2026-11-02",
        startTime: "09:00",
        endTime: "11:00",
        status: "scheduled",
        rescheduled: false,
      }),
    ]);
    expect(classesOn(source, "2026-11-03", [], [])).toEqual([]);
  });

  it("marks a Cancelled Class with its reason", () => {
    const [result] = classesOn(
      source,
      "2026-11-02",
      [change({ reason: "Teacher unwell" })],
      [],
    );
    expect(result).toMatchObject({
      status: "cancelled",
      reason: "Teacher unwell",
    });
  });

  it("shows a Moved Class on both its original and new slots", () => {
    const moved = change({
      date: "2026-11-04",
      kind: "moved",
      movedTo: { date: "2026-11-07", startTime: "16:00", endTime: "18:00" },
    });
    expect(classesOn(source, "2026-11-04", [moved], [])).toEqual([
      expect.objectContaining({ status: "moved", rescheduled: false }),
    ]);
    expect(classesOn(source, "2026-11-07", [moved], [])).toEqual([
      expect.objectContaining({
        date: "2026-11-07",
        startTime: "16:00",
        endTime: "18:00",
        status: "scheduled",
        rescheduled: true,
      }),
    ]);
  });

  it("cancels every Class on a Holiday, including a Class moved onto it", () => {
    const moved = change({
      kind: "moved",
      movedTo: { date: "2026-11-10", startTime: "16:00", endTime: "18:00" },
    });
    expect(classesOn(source, "2026-11-09", [], [diwali])).toEqual([
      expect.objectContaining({ status: "holiday", reason: "Diwali" }),
    ]);
    expect(classesOn(source, "2026-11-10", [moved], [diwali])).toEqual([
      expect.objectContaining({ status: "holiday", rescheduled: true }),
    ]);
  });

  it("keeps a moved Holiday Class moved after the Holiday", () => {
    const moved = change({
      date: "2026-11-09",
      kind: "moved",
      movedTo: { date: "2026-11-14", startTime: "10:00", endTime: "12:00" },
    });
    expect(classesOn(source, "2026-11-09", [moved], [diwali])).toEqual([
      expect.objectContaining({ status: "moved" }),
    ]);
  });

  it("ignores changes to other Batches and Classes at other start times", () => {
    expect(
      classesOn(
        source,
        "2026-11-02",
        [change({ batchId: "other" }), change({ startTime: "16:00" })],
        [],
      ),
    ).toEqual([expect.objectContaining({ status: "scheduled" })]);
  });

  it("affects Student-specific Timings only when their own Class changes", () => {
    const homeTuition = {
      batchId,
      timings: [{ daysOfWeek: [1], startTime: "17:00", endTime: "18:00" }],
    };
    expect(
      classesOn(homeTuition, "2026-11-02", [change({})], [])[0]?.status,
    ).toBe("scheduled");
    expect(
      classesOn(
        homeTuition,
        "2026-11-02",
        [change({ startTime: "17:00" })],
        [],
      )[0]?.status,
    ).toBe("cancelled");
  });

  it("doesn't show a Rescheduled Class to an Enrollment that never had the original", () => {
    const moved = change({
      kind: "moved",
      movedTo: { date: "2026-11-07", startTime: "16:00", endTime: "18:00" },
    });
    const otherTime = {
      batchId,
      timings: [{ daysOfWeek: [1], startTime: "17:00", endTime: "18:00" }],
    };
    expect(classesOn(otherTime, "2026-11-07", [moved], [])).toEqual([]);
    expect(
      classesOn(
        { ...source, firstDate: "2026-11-03" },
        "2026-11-07",
        [moved],
        [],
      ),
    ).toEqual([]);
  });

  it("finds the Class at a start time, preferring the one that will happen", () => {
    expect(
      classAt(source, { date: "2026-11-02", startTime: "09:00" }, [], []),
    ).toMatchObject({ status: "scheduled" });
    expect(
      classAt(source, { date: "2026-11-02", startTime: "10:00" }, [], []),
    ).toBeNull();
  });
});

describe("holidayOn and hasStarted", () => {
  it("covers each date in the Holiday range", () => {
    expect(holidayOn([diwali], "2026-11-08")).toBeNull();
    expect(holidayOn([diwali], "2026-11-09")).toBe(diwali);
    expect(holidayOn([diwali], "2026-11-11")).toBe(diwali);
    expect(holidayOn([diwali], "2026-11-12")).toBeNull();
  });

  it("treats a Class as started from its local start time", () => {
    const now = { date: "2026-11-02", minutes: 9 * 60 };
    expect(hasStarted({ date: "2026-11-02", startTime: "09:00" }, now)).toBe(
      true,
    );
    expect(hasStarted({ date: "2026-11-02", startTime: "09:01" }, now)).toBe(
      false,
    );
    expect(hasStarted({ date: "2026-11-01", startTime: "23:00" }, now)).toBe(
      true,
    );
  });
});
