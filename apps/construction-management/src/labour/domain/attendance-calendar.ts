import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  minutesOfHours,
  type AttendanceDayRow,
  type AttendancePlaceRow,
} from "@/src/shared-kernel/person-attendance";

import type { AttendanceStatus } from "./wages";
import { spanMinutes } from "./wages";

/** A Labour's marked day at one Project, as the Attendance tab reads it. */
export type LabourCalendarDay = {
  date: CalendarDate;
  projectId: string;
  status: AttendanceStatus;
  isPaidLeave: boolean;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number | null;
  /** Decimal hours, as marked that day. */
  workingHours: string;
  /** Each overtime row's decimal hours. */
  overtimeHours: readonly string[];
};

/**
 * A Labour's day at a Project in the Attendance tab (ADR CM-0051 §3): with
 * In and Out, Out − In − break; Present without both times, the working
 * hours marked that day; Half Day, half of them. Absent, leave and
 * holidays have no hours. Overtime is the day's overtime rows.
 */
export function labourCalendarPlace(
  day: LabourCalendarDay,
): AttendancePlaceRow {
  const worked = day.status === "present" || day.status === "half_day";
  const overtimeMinutes = day.overtimeHours.reduce(
    (sum, hours) => sum + minutesOfHours(hours),
    0,
  );
  const base = {
    place: { kind: "project" as const, projectId: day.projectId },
    status:
      day.status === "on_leave" && day.isPaidLeave
        ? ("paid_leave" as const)
        : day.status,
    checkIn: day.checkIn,
    checkOut: day.checkOut,
    overtimeMinutes,
    open: worked && day.checkIn != null && day.checkOut == null,
    pending: false,
    heads: null,
  };
  if (!worked)
    return { ...base, workedMinutes: 0, hoursFrom: "none", open: false };
  if (day.checkIn != null && day.checkOut != null)
    return {
      ...base,
      workedMinutes: Math.max(
        0,
        spanMinutes(day.checkIn, day.checkOut) - (day.breakMinutes ?? 0),
      ),
      hoursFrom: "times",
    };
  const full = minutesOfHours(day.workingHours);
  return {
    ...base,
    workedMinutes: day.status === "half_day" ? Math.round(full / 2) : full,
    hoursFrom: "working_hours",
  };
}

/** Marked days, one per Project, grouped into calendar days. */
export function labourCalendarDays(
  days: readonly LabourCalendarDay[],
): AttendanceDayRow[] {
  const byDate = new Map<CalendarDate, AttendancePlaceRow[]>();
  for (const day of days) {
    const places = byDate.get(day.date) ?? [];
    places.push(labourCalendarPlace(day));
    byDate.set(day.date, places);
  }
  return [...byDate].map(([date, places]) => ({ date, status: null, places }));
}
