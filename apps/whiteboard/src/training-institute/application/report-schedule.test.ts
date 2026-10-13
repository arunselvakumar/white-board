import { describe, expect, it } from "vitest";

import { countAttendance } from "../domain/attendance-count";
import type { AttendanceStatus } from "../domain/attendance-register";
import type { ClassChangeFact, HolidayFact } from "../domain/class-schedule";
import type { ReportMark } from "./report-ports";
import {
  batchClassSlots,
  enrollmentClassLines,
  hasEnded,
} from "./report-schedule";

const BATCH = "11111111-1111-4111-8111-111111111111";
const WEEKDAYS = [
  { daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "11:00" },
];

// October 2026: 22 weekdays. Diwali Holidays on Tue 20 and Wed 21, a power
// cut cancels Tue 6, and Wed 14 moves to Sat 17.
const holidays: HolidayFact[] = [
  {
    id: "h1",
    startDate: "2026-10-20",
    endDate: "2026-10-21",
    reason: "Diwali",
  },
];
const changes: ClassChangeFact[] = [
  {
    id: "c1",
    batchId: BATCH,
    date: "2026-10-06",
    startTime: "09:00",
    endTime: "11:00",
    kind: "cancelled",
    reason: "power cut",
    movedTo: null,
  },
  {
    id: "c2",
    batchId: BATCH,
    date: "2026-10-14",
    startTime: "09:00",
    endTime: "11:00",
    kind: "moved",
    reason: null,
    movedTo: { date: "2026-10-17", startTime: "09:00", endTime: "11:00" },
  },
];

function marksFor(dates: string[], statuses: AttendanceStatus[]) {
  return new Map(
    dates.map((date, index): [string, ReportMark] => [
      date,
      {
        batchId: BATCH,
        date,
        enrollmentId: "e1",
        studentId: "s1",
        status: statuses[index] ?? "unmarked",
        note: null,
        markedAt: new Date(`${date}T05:00:00.000Z`),
        markedByUserId: "teacher",
      },
    ]),
  );
}

const october = { from: "2026-10-01", to: "2026-10-31" };

describe("Classes held for one Enrollment (Reports §6.4)", () => {
  const held = enrollmentClassLines({
    batchId: BATCH,
    timings: WEEKDAYS,
    window: { start: "2026-09-15", end: null },
    range: october,
    changes,
    holidays,
    marks: new Map(),
    now: { date: "2026-11-01", minutes: 600 },
  }).filter((line) => line.kind === "held");

  it("holds 19 Classes in Priya's October and lists the rest uncounted", () => {
    const lines = enrollmentClassLines({
      batchId: BATCH,
      timings: WEEKDAYS,
      window: { start: "2026-09-15", end: null },
      range: october,
      changes,
      holidays,
      marks: marksFor(
        held.map((line) => line.date),
        [
          ...Array<AttendanceStatus>(13).fill("present"),
          "late",
          "late",
          "informed_absent",
          "absent",
          "absent",
          "excused",
        ],
      ),
      now: { date: "2026-11-01", minutes: 600 },
    });
    const counts = countAttendance(
      lines.filter((line) => line.kind === "held").map((line) => line.status),
    );
    expect(counts).toMatchObject({
      held: 19,
      counted: 18,
      attended: 15,
      percent: 83,
    });
    expect(lines.filter((line) => line.kind === "holiday")).toHaveLength(2);
    expect(lines.find((line) => line.kind === "cancelled")).toMatchObject({
      date: "2026-10-06",
      reason: "power cut",
    });
    expect(lines.find((line) => line.kind === "moved")).toMatchObject({
      date: "2026-10-14",
      movedTo: { date: "2026-10-17" },
    });
  });

  it("counts a Moved Class once, on its new date", () => {
    expect(held.map((line) => line.date)).toContain("2026-10-17");
    expect(held.map((line) => line.date)).not.toContain("2026-10-14");
    expect(held.find((line) => line.date === "2026-10-17")?.rescheduled).toBe(
      true,
    );
  });

  it("skips Classes before the Enrollment began and after it ended", () => {
    const lines = enrollmentClassLines({
      batchId: BATCH,
      timings: WEEKDAYS,
      window: { start: "2026-10-15", end: "2026-10-23" },
      range: october,
      changes,
      holidays,
      marks: new Map(),
      now: { date: "2026-11-01", minutes: 600 },
    });
    const dates = lines
      .filter((line) => line.kind === "held")
      .map((line) => line.date);
    expect(dates[0]).toBe("2026-10-15");
    expect(dates.at(-1)).toBe("2026-10-23");
  });

  it("stops at now: today's Class counts once it has begun", () => {
    const before = enrollmentClassLines({
      batchId: BATCH,
      timings: WEEKDAYS,
      window: { start: "2026-09-15", end: null },
      range: october,
      changes,
      holidays,
      marks: new Map(),
      now: { date: "2026-10-13", minutes: 8 * 60 },
    });
    const after = enrollmentClassLines({
      batchId: BATCH,
      timings: WEEKDAYS,
      window: { start: "2026-09-15", end: null },
      range: october,
      changes,
      holidays,
      marks: new Map(),
      now: { date: "2026-10-13", minutes: 9 * 60 + 5 },
    });
    expect(before.filter((line) => line.kind === "held").at(-1)?.date).toBe(
      "2026-10-12",
    );
    expect(after.filter((line) => line.kind === "held").at(-1)?.date).toBe(
      "2026-10-13",
    );
  });

  it("only counts a home-tuition Student's own days", () => {
    const lines = enrollmentClassLines({
      batchId: BATCH,
      timings: [{ daysOfWeek: [6], startTime: "16:00", endTime: "18:00" }],
      window: { start: "2026-09-15", end: null },
      range: october,
      changes,
      holidays,
      marks: new Map(),
      now: { date: "2026-11-01", minutes: 600 },
    });
    expect(lines.map((line) => line.date)).toEqual([
      "2026-10-03",
      "2026-10-10",
      "2026-10-17",
      "2026-10-24",
      "2026-10-31",
    ]);
  });

  it("keeps a marked date the current Timings no longer produce", () => {
    const lines = enrollmentClassLines({
      batchId: BATCH,
      timings: [{ daysOfWeek: [6], startTime: "16:00", endTime: "18:00" }],
      window: { start: "2026-09-15", end: null },
      range: october,
      changes: [],
      holidays: [],
      marks: marksFor(["2026-10-05"], ["present"]),
      now: { date: "2026-11-01", minutes: 600 },
    });
    expect(lines.find((line) => line.date === "2026-10-05")).toMatchObject({
      kind: "held",
      status: "present",
      startTime: null,
    });
  });
});

describe("a Batch's Class slots", () => {
  it("joins the Batch's Timings and Student-specific ones, one per start time", () => {
    const slots = batchClassSlots({
      batchId: BATCH,
      sources: [
        { timings: WEEKDAYS, firstDate: "2026-09-01", lastDate: null },
        { timings: WEEKDAYS, firstDate: "2026-09-01", lastDate: null },
        {
          timings: [{ daysOfWeek: [6], startTime: "16:00", endTime: "18:00" }],
          firstDate: "2026-10-10",
          lastDate: null,
        },
      ],
      range: { from: "2026-10-12", to: "2026-10-18" },
      changes,
      holidays,
    });
    expect(
      slots.map((slot) => `${slot.date} ${slot.startTime} ${slot.status}`),
    ).toEqual([
      "2026-10-12 09:00 scheduled",
      "2026-10-13 09:00 scheduled",
      "2026-10-14 09:00 moved",
      "2026-10-15 09:00 scheduled",
      "2026-10-16 09:00 scheduled",
      "2026-10-17 09:00 scheduled",
      "2026-10-17 16:00 scheduled",
    ]);
  });

  it("treats a Class as over once its end time passes", () => {
    const slot = { date: "2026-10-13", endTime: "11:00" };
    expect(hasEnded(slot, { date: "2026-10-13", minutes: 10 * 60 })).toBe(
      false,
    );
    expect(hasEnded(slot, { date: "2026-10-13", minutes: 11 * 60 })).toBe(true);
    expect(hasEnded(slot, { date: "2026-10-14", minutes: 0 })).toBe(true);
  });
});
