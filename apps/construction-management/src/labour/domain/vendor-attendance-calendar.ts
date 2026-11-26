import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  minutesOfHours,
  type AttendanceDayRow,
  type AttendancePlaceRow,
} from "@/src/shared-kernel/person-attendance";

/** One saved Vendor attendance (not deleted) at a Project, as the Attendance tab reads it. */
export type VendorCalendarDay = {
  date: CalendarDate;
  projectId: string;
  lines: readonly {
    fullDayCount: number;
    halfDayCount: number;
    /** Decimal hours for the whole line, not per head. */
    overtimeHours: string;
  }[];
};

/**
 * A Vendor's days in the Attendance tab (ADR CM-0051 §3): per Project per
 * day, the headcount of every line (full days and half days) and the
 * lines' overtime hours. No hours worked and no times: a Vendor's day is
 * measured in head-days. A Project whose lines add up to no heads at all
 * supplied nobody that day, so it is left out (its overtime with it), and
 * a day with no such Project is not a day supplied.
 */
export function vendorCalendarDays(
  days: readonly VendorCalendarDay[],
): AttendanceDayRow[] {
  const byDay = new Map<CalendarDate, Map<string, AttendancePlaceRow>>();
  for (const day of days) {
    const projects =
      byDay.get(day.date) ?? new Map<string, AttendancePlaceRow>();
    const place: AttendancePlaceRow = projects.get(day.projectId) ?? {
      place: { kind: "project", projectId: day.projectId },
      status: null,
      checkIn: null,
      checkOut: null,
      workedMinutes: 0,
      overtimeMinutes: 0,
      hoursFrom: "none",
      open: false,
      pending: false,
      heads: { full: 0, half: 0 },
    };
    for (const line of day.lines) {
      const heads = place.heads ?? { full: 0, half: 0 };
      place.heads = {
        full: heads.full + line.fullDayCount,
        half: heads.half + line.halfDayCount,
      };
      place.overtimeMinutes += minutesOfHours(line.overtimeHours);
    }
    projects.set(day.projectId, place);
    byDay.set(day.date, projects);
  }
  const rows: AttendanceDayRow[] = [];
  for (const [date, projects] of byDay) {
    const places = [...projects.values()].filter(
      (place) => place.heads != null && place.heads.full + place.heads.half > 0,
    );
    if (places.length > 0) rows.push({ date, status: null, places });
  }
  return rows;
}
