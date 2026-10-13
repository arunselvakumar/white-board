// How attendance is counted everywhere in Reports (Reports PRD §6.4).
//
// - Attended = Present + Late.
// - Absent = Informed absent + Uninformed absent, always labelled apart.
// - Excused and Not marked are left out of the % entirely, top and bottom.
// - Attendance % = Attended ÷ (Attended + Absent), rounded to a whole number;
//   null ("–") when nothing counts.
// - Cancelled Classes, Holidays and the original slot of a Moved Class never
//   reach these counts: callers pass only Classes that were held.

import type { AttendanceStatus } from "./attendance-register";

export type AttendanceCounts = {
  /** Classes held for the Student in the period. */
  held: number;
  present: number;
  late: number;
  informedAbsent: number;
  uninformedAbsent: number;
  excused: number;
  notMarked: number;
  /** Present + Late. */
  attended: number;
  /** Informed + Uninformed absent. */
  absent: number;
  /** Attended + Absent: the bottom of the %. */
  counted: number;
  percent: number | null;
};

export const EMPTY_ATTENDANCE_COUNTS: AttendanceCounts = {
  held: 0,
  present: 0,
  late: 0,
  informedAbsent: 0,
  uninformedAbsent: 0,
  excused: 0,
  notMarked: 0,
  attended: 0,
  absent: 0,
  counted: 0,
  percent: null,
};

export function attendancePercent(
  attended: number,
  absent: number,
): number | null {
  const counted = attended + absent;
  return counted === 0 ? null : Math.round((attended / counted) * 100);
}

/** Counts for the held Classes' statuses; null or unmarked is Not marked. */
export function countAttendance(
  statuses: Iterable<AttendanceStatus | null>,
): AttendanceCounts {
  const counts = { ...EMPTY_ATTENDANCE_COUNTS };
  for (const status of statuses) {
    counts.held += 1;
    switch (status) {
      case "present":
        counts.present += 1;
        break;
      case "late":
        counts.late += 1;
        break;
      case "informed_absent":
        counts.informedAbsent += 1;
        break;
      case "absent":
        counts.uninformedAbsent += 1;
        break;
      case "excused":
        counts.excused += 1;
        break;
      case "unmarked":
      case null:
        counts.notMarked += 1;
        break;
    }
  }
  return withTotals(counts);
}

function withTotals(counts: AttendanceCounts): AttendanceCounts {
  const attended = counts.present + counts.late;
  const absent = counts.informedAbsent + counts.uninformedAbsent;
  return {
    ...counts,
    attended,
    absent,
    counted: attended + absent,
    percent: attendancePercent(attended, absent),
  };
}

/** The sum of several counts, with the % worked out again from the sums. */
export function addAttendanceCounts(
  list: readonly AttendanceCounts[],
): AttendanceCounts {
  const sum = { ...EMPTY_ATTENDANCE_COUNTS };
  for (const counts of list) {
    sum.held += counts.held;
    sum.present += counts.present;
    sum.late += counts.late;
    sum.informedAbsent += counts.informedAbsent;
    sum.uninformedAbsent += counts.uninformedAbsent;
    sum.excused += counts.excused;
    sum.notMarked += counts.notMarked;
  }
  return withTotals(sum);
}

/** "84% (16 of 19)", or "–" when nothing counts. */
export function formatAttendance(counts: AttendanceCounts): string {
  return counts.percent == null
    ? "–"
    : `${String(counts.percent)}% (${String(counts.attended)} of ${String(counts.counted)})`;
}

export function isAbsence(status: AttendanceStatus | null): boolean {
  return status === "absent" || status === "informed_absent";
}

export function isAttended(status: AttendanceStatus | null): boolean {
  return status === "present" || status === "late";
}

export type AbsenceRun<T> = { length: number; first: T | null; last: T | null };

/**
 * Runs of absences, informed and uninformed together, in Class order.
 * Excused and Not marked Classes are skipped: they neither break nor extend
 * a run. Returns the longest run and the run still open at the end.
 */
export function absenceRuns<T extends { status: AttendanceStatus | null }>(
  classes: readonly T[],
): { longest: AbsenceRun<T>; current: AbsenceRun<T> } {
  let longest: AbsenceRun<T> = { length: 0, first: null, last: null };
  let current: AbsenceRun<T> = { length: 0, first: null, last: null };
  for (const item of classes) {
    if (isAbsence(item.status)) {
      current = {
        length: current.length + 1,
        first: current.first ?? item,
        last: item,
      };
      if (current.length > longest.length) longest = current;
    } else if (isAttended(item.status)) {
      current = { length: 0, first: null, last: null };
    }
  }
  return { longest, current };
}

/** Low-attendance standing of one Student (Reports PRD R3). */
export type AttendanceStanding = "too_early" | "below" | "ok";

export function attendanceStanding(
  counts: AttendanceCounts,
  settings: { thresholdPercent: number; minimumClasses: number },
): AttendanceStanding {
  if (counts.counted < settings.minimumClasses) return "too_early";
  return counts.percent != null && counts.percent < settings.thresholdPercent
    ? "below"
    : "ok";
}
