import type { AttendanceSummary } from "@/src/queries/attendance";

/** Counts per status; Absent (uninformed) and Informed absent stay apart. */
export function summaryLine(summary: AttendanceSummary): string {
  return [
    `${summary.present} Present`,
    `${summary.absent} Absent`,
    `${summary.informedAbsent} Informed absent`,
    `${summary.late} Late`,
    `${summary.excused} Excused`,
    `${summary.unmarked} Unmarked`,
  ].join(" · ");
}
