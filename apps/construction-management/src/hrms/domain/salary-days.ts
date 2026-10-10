import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { countDays, type DayResult } from "./attendance";
import type { OvertimeDay, SalaryDayCounts } from "./salary-calculation";

/**
 * A member's month as the salary run counts it (CM-316): the Attendance
 * Details of the slip and the overtime per day, from the month of day
 * results attendance gives (CM-308: status with approved leave, holidays
 * and week offs folded in, worked and overtime hours, and the day's shift
 * for overtime pay). The counting itself is attendance's `countDays`, so
 * the slip and the monthly summary never disagree. Pure.
 *
 * On top of it the run applies two salary rules:
 *
 * 1. Days before the member's salary starts (`salaryStartsOn`, a
 *    mid-month joiner) are not employed: never paid, not counted.
 * 2. Days after `today` (the current month calculated early) are not
 *    counted, so they are paid (decisions-salary §12, "days not accounted
 *    for are paid"); their working days still count as working days.
 *
 * Overtime is paid only for days whose shift allows it, at that shift's
 * working hours (ADR CM-0012 §14).
 */

export type SalaryDaysInput = {
  /** Every date of the month, in order (`AttendanceDaySource`). */
  days: readonly DayResult[];
  /** The first day the member's salary covers; null = before the month. */
  salaryStartsOn: CalendarDate | null;
  /** Company today; dates after it are not counted. Null = count all. */
  today: CalendarDate | null;
};

export type SalaryDays = {
  days: Required<SalaryDayCounts>;
  overtime: OvertimeDay[];
  /** Hours worked in the counted days, two decimals. */
  totalHours: number;
};

/** Hours to two decimals, 0 to 24. */
function hours(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(24, Math.round(value * 100) / 100);
}

export function aggregateSalaryDays(input: SalaryDaysInput): SalaryDays {
  const employed = input.days.filter(
    (day) => input.salaryStartsOn == null || day.date >= input.salaryStartsOn,
  );
  const counted = employed.filter(
    (day) => input.today == null || day.date <= input.today,
  );
  const laterWorking = employed.filter(
    (day) =>
      input.today != null &&
      day.date > input.today &&
      day.status !== "holiday" &&
      day.status !== "week_off",
  ).length;
  const counts = countDays(counted);
  const overtime: OvertimeDay[] = counted
    .filter((day) => hours(day.overtimeHours) > 0)
    .map((day) => ({
      date: day.date,
      hours: hours(day.overtimeHours),
      overtimeAllowed: day.overtimeAllowed,
      shiftWorkingHours:
        day.shiftWorkingHours > 0 ? hours(day.shiftWorkingHours) : 8,
    }));
  return {
    days: {
      workingDays: counts.workingDays + laterWorking,
      present: counts.present,
      halfDays: counts.halfDays,
      absent: counts.absent,
      paidLeave: counts.paidLeave,
      unpaidLeave: counts.unpaidLeave,
      weekOff: counts.weekOff,
      holidays: counts.holidays,
      notEmployed: input.days.length - employed.length,
    },
    overtime,
    totalHours: counts.workedHours,
  };
}
