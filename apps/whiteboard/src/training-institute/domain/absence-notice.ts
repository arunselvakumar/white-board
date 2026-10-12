// Absence Notice rules (ADR-0041). Pure and client-safe: no I/O, no server
// imports. Whether a Notice applies is worked out on read from the schedule.

import {
  addCalendarDays,
  classesOn,
  clockMinutes,
  hasStarted,
  type ClassChangeFact,
  type ClassSlotTime,
  type HolidayFact,
  type LocalNow,
  type ScheduleSource,
} from "./class-schedule";
import { DomainError } from "./errors";

export const ABSENCE_REASONS = [
  "sick",
  "exam",
  "travel",
  "family",
  "other",
] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number];

export const ABSENCE_REASON_LABELS: Record<AbsenceReason, string> = {
  sick: "Sick",
  exam: "Exam",
  travel: "Travel",
  family: "Family function",
  other: "Other",
};

export const ABSENCE_NOTE_MAX = 300;
/** How far ahead notice can be given, in days from today (ADR-0041 §4). */
export const ABSENCE_NOTICE_HORIZON_DAYS = 60;
/** Classes one request may cover; a 60-day daily Batch is about 60. */
export const ABSENCE_NOTICE_MAX_CLASSES = 100;

export type AbsenceGiverRole = "student" | "parent";

export function isAbsenceReason(value: string): value is AbsenceReason {
  return (ABSENCE_REASONS as readonly string[]).includes(value);
}

export function absenceReason(raw: string): AbsenceReason {
  if (!isAbsenceReason(raw))
    throw new DomainError(
      "ABSENCE_NOTICE_REASON_REQUIRED",
      "Choose a reason: Sick, Exam, Travel, Family function, or Other.",
    );
  return raw;
}

export function absenceNote(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value.length === 0) return null;
  if (value.length > ABSENCE_NOTE_MAX)
    throw new DomainError(
      "ABSENCE_NOTICE_NOTE_TOO_LONG",
      `The note must be ${String(ABSENCE_NOTE_MAX)} characters or fewer.`,
    );
  return value;
}

/** A Class as an Absence Notice keys it: Batch, local date, start time. */
export type NoticeClassKey = {
  batchId: string;
  date: string;
  startTime: string;
};

/** A Class that notice can be given for. */
export type NoticeableClass = ClassSlotTime & {
  batchId: string;
  /** True when this is the new time of a Moved Class. */
  rescheduled: boolean;
};

/**
 * Classes of one Enrollment that notice can be given for: still scheduled,
 * not yet started, from today up to the horizon, in date and time order.
 * Includes the new time of a Moved Class; never a Cancelled Class, a Holiday,
 * or a Moved Class's original slot.
 */
export function noticeableClasses(
  source: ScheduleSource,
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
  now: LocalNow,
  horizonDays: number = ABSENCE_NOTICE_HORIZON_DAYS,
): NoticeableClass[] {
  const result: NoticeableClass[] = [];
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = addCalendarDays(now.date, offset);
    for (const scheduled of classesOn(source, date, changes, holidays)) {
      if (scheduled.status !== "scheduled" || hasStarted(scheduled, now))
        continue;
      result.push({
        batchId: scheduled.batchId,
        date,
        startTime: scheduled.startTime,
        endTime: scheduled.endTime,
        rescheduled: scheduled.rescheduled,
      });
    }
  }
  return result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      clockMinutes(a.startTime) - clockMinutes(b.startTime),
  );
}

/**
 * Whether a Notice's Class still happens at its key. `applies` means the
 * Notice counts: in Teacher and Owner lists, Register flags, Notifications.
 * Otherwise the reason it doesn't, and for a moved Class its new time so the
 * family can give notice again.
 */
export type NoticeStanding =
  | { status: "applies" }
  | { status: "cancelled" }
  | { status: "holiday" }
  | { status: "moved"; movedTo: ClassSlotTime | null }
  | { status: "not_scheduled" };

export function noticeStanding(
  source: ScheduleSource,
  key: { date: string; startTime: string },
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
): NoticeStanding {
  const matches = classesOn(source, key.date, changes, holidays).filter(
    (scheduled) => scheduled.startTime === key.startTime,
  );
  if (matches.some((scheduled) => scheduled.status === "scheduled"))
    return { status: "applies" };
  const found = matches[0];
  if (found == null) return { status: "not_scheduled" };
  if (found.status === "holiday") return { status: "holiday" };
  if (found.status === "moved")
    return { status: "moved", movedTo: found.change?.movedTo ?? null };
  return { status: "cancelled" };
}

/** Notice can be given, or withdrawn, only before the Class starts. */
export function assertBeforeClassStarts(
  key: { date: string; startTime: string },
  now: LocalNow,
): void {
  if (hasStarted(key, now))
    throw new DomainError(
      "ABSENCE_NOTICE_CLASS_STARTED",
      "This Class has already started.",
    );
}
