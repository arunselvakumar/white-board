import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type {
  AttendanceDayRow,
  AttendancePlaceRow,
} from "@/src/shared-kernel/person-attendance";

import { clockTime, type CheckInAction } from "./check-in";

const MINUTE_MS = 60_000;

/** A live check-in entry (not voided), as the Attendance tab reads it. */
export type CalendarCheckInEntry = {
  projectId: string;
  action: CheckInAction;
  occurredAt: Date;
  /** The Check In's day; a Check Out carries the day of the Check In it closes. */
  attendanceDate: CalendarDate;
};

/**
 * One Project's day from its check-in entries (ADR CM-0051 §3): each Check
 * In to the next Check Out, the pairs' minutes added up. In is the first
 * Check In's clock time and Out the last Check Out's. A Check In left
 * with no Check Out after it is open and adds nothing; a second Check In
 * while already in is skipped (the first one stands), and a Check Out with
 * no Check In before it is ignored, as in a Labour's day from its entries
 * (ADR CM-0043 §3). Null when the day has no Check In.
 */
export function checkInCalendarPlace(
  projectId: string,
  entries: readonly Pick<CalendarCheckInEntry, "action" | "occurredAt">[],
  timeZone: string,
): AttendancePlaceRow | null {
  const sorted = [...entries].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );
  let first: Date | null = null;
  let lastOut: Date | null = null;
  let inSince: Date | null = null;
  let workedMinutes = 0;
  for (const entry of sorted) {
    if (entry.action === "check_in") {
      if (inSince != null) continue;
      inSince = entry.occurredAt;
      first ??= entry.occurredAt;
    } else {
      if (inSince == null) continue;
      workedMinutes +=
        Math.floor(entry.occurredAt.getTime() / MINUTE_MS) -
        Math.floor(inSince.getTime() / MINUTE_MS);
      lastOut = entry.occurredAt;
      inSince = null;
    }
  }
  if (first == null) return null;
  return {
    place: { kind: "project", projectId },
    status: null,
    checkIn: clockTime(first, timeZone),
    checkOut: lastOut == null ? null : clockTime(lastOut, timeZone),
    workedMinutes,
    overtimeMinutes: 0,
    hoursFrom: "times",
    open: inSince != null,
    pending: false,
    heads: null,
  };
}

/**
 * A Site Engineer's days from their live check-in entries (ADR CM-0051
 * §3), one place per Project per attendance day. A night shift's Check Out
 * after midnight stays on the Check In's day, as the log stores it.
 */
export function checkInCalendarDays(
  entries: readonly CalendarCheckInEntry[],
  timeZone: string,
): AttendanceDayRow[] {
  const byDay = new Map<CalendarDate, Map<string, CalendarCheckInEntry[]>>();
  for (const entry of entries) {
    const projects = byDay.get(entry.attendanceDate) ?? new Map();
    const list = projects.get(entry.projectId) ?? [];
    list.push(entry);
    projects.set(entry.projectId, list);
    byDay.set(entry.attendanceDate, projects);
  }
  const days: AttendanceDayRow[] = [];
  for (const [date, projects] of byDay) {
    const places = [...projects].flatMap(([projectId, list]) => {
      const place = checkInCalendarPlace(projectId, list, timeZone);
      return place == null ? [] : [place];
    });
    if (places.length > 0) days.push({ date, status: null, places });
  }
  return days;
}
