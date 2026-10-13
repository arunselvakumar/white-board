// Which Classes a period held, for one Enrollment or one Batch (Reports PRD
// §6.4). Weekly Timings produce the Classes; Class Changes and Holidays are
// applied the same way as everywhere else (ADR-0028): a Moved Class counts
// once, on its new date, and its original slot is a labelled line.

import type { AttendanceStatus } from "../domain/attendance-register";
import {
  addCalendarDays,
  classesOn,
  clockMinutes,
  type ClassChangeFact,
  type ClassSlotTime,
  type HolidayFact,
  type LocalNow,
} from "../domain/class-schedule";
import type { WeeklySlot } from "../domain/weekly-timings";
import type { DateRange, ReportMark } from "./report-ports";

/** One line in a Student's date-by-date list. */
export type ClassLine = {
  date: string;
  /** Null for a marked date the current Timings no longer produce. */
  startTime: string | null;
  endTime: string | null;
  kind: "held" | "cancelled" | "holiday" | "moved";
  /** The mark for a held Class; null when Not marked. */
  status: AttendanceStatus | null;
  note: string | null;
  reason: string | null;
  movedTo: ClassSlotTime | null;
  /** A held Class at the new time of a Moved Class. */
  rescheduled: boolean;
};

export type ClassSlot = {
  date: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "cancelled" | "holiday" | "moved";
  rescheduled: boolean;
  reason: string | null;
  movedTo: ClassSlotTime | null;
};

/** Every date from `from` to `to`, both included. */
export function datesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let date = from; date <= to; date = addCalendarDays(date, 1))
    dates.push(date);
  return dates;
}

/** A Class has been held once its start time has passed. */
export function hasBegun(
  slot: { date: string; startTime: string },
  now: LocalNow,
): boolean {
  return (
    slot.date < now.date ||
    (slot.date === now.date && clockMinutes(slot.startTime) <= now.minutes)
  );
}

/** A Class is over once its end time has passed (R5). */
export function hasEnded(
  slot: { date: string; endTime: string },
  now: LocalNow,
): boolean {
  return (
    slot.date < now.date ||
    (slot.date === now.date && clockMinutes(slot.endTime) <= now.minutes)
  );
}

/** The local dates an Enrollment covers: from it began to when it ended. */
export type EnrollmentWindow = { start: string; end: string | null };

/**
 * One Enrollment's Classes in a range, up to now. A date with at least one
 * held Class is one line: the register is kept per Batch and date, so that
 * is what a mark covers. A date the Student was marked on counts even when
 * the current Timings no longer produce a Class there. Cancelled, Holiday and
 * Moved slots are lines of their own and are never counted.
 */
export function enrollmentClassLines(input: {
  batchId: string;
  timings: readonly WeeklySlot[];
  window: EnrollmentWindow;
  range: DateRange;
  changes: readonly ClassChangeFact[];
  holidays: readonly HolidayFact[];
  /** Marks of this Enrollment, by date. */
  marks: ReadonlyMap<string, ReportMark>;
  now: LocalNow;
}): ClassLine[] {
  const from =
    input.range.from > input.window.start
      ? input.range.from
      : input.window.start;
  let to = input.range.to < input.now.date ? input.range.to : input.now.date;
  if (input.window.end != null && input.window.end < to) to = input.window.end;
  if (from > to) return [];
  const lines: ClassLine[] = [];
  const source = {
    batchId: input.batchId,
    timings: input.timings,
    firstDate: input.window.start,
  };
  for (const date of datesBetween(from, to)) {
    const classes = classesOn(source, date, input.changes, input.holidays);
    const held = classes.filter(
      (item) => item.status === "scheduled" && hasBegun(item, input.now),
    );
    const mark = input.marks.get(date) ?? null;
    if (held.length > 0 || mark != null) {
      const first = held[0];
      const last = held.at(-1);
      lines.push({
        date,
        startTime: first?.startTime ?? null,
        endTime: last?.endTime ?? null,
        kind: "held",
        status: mark == null || mark.status === "unmarked" ? null : mark.status,
        note: mark?.note ?? null,
        reason: null,
        movedTo: null,
        rescheduled: held.some((item) => item.rescheduled),
      });
    }
    for (const item of classes) {
      if (item.status === "scheduled") continue;
      lines.push({
        date,
        startTime: item.startTime,
        endTime: item.endTime,
        kind: item.status,
        status: null,
        note: null,
        reason: item.reason,
        movedTo:
          item.status === "moved" ? (item.change?.movedTo ?? null) : null,
        rescheduled: false,
      });
    }
  }
  return lines;
}

/**
 * Every Class slot of a Batch in a range: its own Timings plus the
 * Student-specific Timings of its Enrollments, one slot per start time.
 */
export function batchClassSlots(input: {
  batchId: string;
  sources: readonly {
    timings: readonly WeeklySlot[];
    firstDate: string;
    lastDate: string | null;
  }[];
  range: DateRange;
  changes: readonly ClassChangeFact[];
  holidays: readonly HolidayFact[];
}): ClassSlot[] {
  const slots = new Map<string, ClassSlot>();
  for (const date of datesBetween(input.range.from, input.range.to)) {
    for (const source of input.sources) {
      if (source.lastDate != null && date > source.lastDate) continue;
      for (const item of classesOn(
        {
          batchId: input.batchId,
          timings: source.timings,
          firstDate: source.firstDate,
        },
        date,
        input.changes,
        input.holidays,
      )) {
        const key = `${date} ${item.startTime} ${item.status}`;
        if (slots.has(key)) continue;
        slots.set(key, {
          date,
          startTime: item.startTime,
          endTime: item.endTime,
          status: item.status,
          rescheduled: item.rescheduled,
          reason: item.reason,
          movedTo:
            item.status === "moved" ? (item.change?.movedTo ?? null) : null,
        });
      }
    }
  }
  return [...slots.values()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      clockMinutes(a.startTime) - clockMinutes(b.startTime),
  );
}

/** Minutes from start to end time. */
export function slotMinutes(slot: { startTime: string; endTime: string }) {
  return Math.max(0, clockMinutes(slot.endTime) - clockMinutes(slot.startTime));
}
