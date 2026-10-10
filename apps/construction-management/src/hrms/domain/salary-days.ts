import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { datesOf, type MonthKey } from "./calendar";
import type { OvertimeDay, SalaryDayCounts } from "./salary-calculation";

/**
 * A member's month as the salary run counts it (CM-316): the Attendance
 * Details of the slip and the overtime per day, from the work calendar
 * (holidays and week offs, CM-305/CM-307), approved leave (CM-312) and the
 * day's attendance status (CM-308), with each day's shift for overtime
 * (CM-307). Pure: the run reads the ports and passes their answers in.
 *
 * Per date, in this order:
 *
 * 1. Before the member's salary starts (`salaryStartsOn`, a mid-month
 *    joiner): not employed, never paid.
 * 2. After `today` (the current month calculated early): not counted, so
 *    paid (decisions-salary §12, "days not accounted for are paid").
 * 3. A non-optional holiday or a week off by the calendar (or by the
 *    attendance status): Holidays / Week Off. Paid.
 * 4. A working day with approved leave: Paid Leave or Unpaid Leave for the
 *    leave's days (at most one a day). A half-day leave's other half is
 *    Present when the member worked (present, half day, or hours on
 *    record), else Absent.
 * 5. A working day without leave, by attendance: Present, Half Day,
 *    Absent, or the leave the attendance status carries. No record is
 *    Absent.
 *
 * Hours worked and overtime are summed over every counted date, with the
 * day's shift deciding whether overtime is paid (ADR CM-0012 §14).
 */

export type SalaryCalendarDay = {
  date: CalendarDate;
  kind: "working" | "week_off" | "holiday";
};

export type SalaryAttendanceDay = {
  date: CalendarDate;
  status:
    "present" | "half_day" | "absent" | "on_leave" | "holiday" | "week_off";
  workedHours: number;
  overtimeHours: number;
  leave: { paid: boolean; half: boolean } | null;
};

export type SalaryLeaveDay = {
  date: CalendarDate;
  isPaid: boolean;
  /** 1 for a full day, 0.5 for a morning or an afternoon. */
  days: number;
};

export type SalaryShiftDay = {
  overtimeAllowed: boolean;
  workingHours: number;
};

export type SalaryDaysInput = {
  month: MonthKey;
  calendar: readonly SalaryCalendarDay[];
  attendance: readonly SalaryAttendanceDay[];
  leave: readonly SalaryLeaveDay[];
  shifts: ReadonlyMap<CalendarDate, SalaryShiftDay>;
  /** The first day the member's salary covers; null = before the month. */
  salaryStartsOn: CalendarDate | null;
  /** Company today; dates after it are not counted. Null = count all. */
  today: CalendarDate | null;
};

export type SalaryDays = {
  days: Required<SalaryDayCounts>;
  overtime: OvertimeDay[];
  /** Hours worked in the month, two decimals. */
  totalHours: number;
};

/** Hours to two decimals, 0 to `max`. */
function hours(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(max, Math.round(value * 100) / 100);
}

export function aggregateSalaryDays(input: SalaryDaysInput): SalaryDays {
  const calendar = new Map(input.calendar.map((day) => [day.date, day.kind]));
  const attendance = new Map(input.attendance.map((day) => [day.date, day]));
  const leaveByDate = new Map<string, { paid: number; unpaid: number }>();
  for (const day of input.leave) {
    const entry = leaveByDate.get(day.date) ?? { paid: 0, unpaid: 0 };
    if (day.isPaid) entry.paid += day.days;
    else entry.unpaid += day.days;
    leaveByDate.set(day.date, entry);
  }

  // Halves, so every sum stays exact.
  const h = {
    workingDays: 0,
    present: 0,
    halfDays: 0,
    absent: 0,
    paidLeave: 0,
    unpaidLeave: 0,
    weekOff: 0,
    holidays: 0,
    notEmployed: 0,
  };
  const overtime: OvertimeDay[] = [];
  let hundredths = 0;

  for (const date of datesOf(input.month)) {
    if (input.salaryStartsOn != null && date < input.salaryStartsOn) {
      h.notEmployed += 2;
      continue;
    }
    const record = attendance.get(date) ?? null;
    let kind = calendar.get(date) ?? "working";
    if (
      kind === "working" &&
      (record?.status === "holiday" || record?.status === "week_off")
    )
      kind = record.status === "holiday" ? "holiday" : "week_off";
    if (kind === "working") h.workingDays += 2;
    if (input.today != null && date > input.today) continue;

    if (record != null) {
      hundredths += Math.round(hours(record.workedHours, 24) * 100);
      const extra = hours(record.overtimeHours, 24);
      if (extra > 0) {
        const shift = input.shifts.get(date);
        overtime.push({
          date,
          hours: extra,
          overtimeAllowed: shift?.overtimeAllowed === true,
          shiftWorkingHours:
            shift != null && shift.workingHours > 0
              ? hours(shift.workingHours, 24)
              : 8,
        });
      }
    }

    if (kind === "holiday") {
      h.holidays += 2;
      continue;
    }
    if (kind === "week_off") {
      h.weekOff += 2;
      continue;
    }

    const worked =
      record != null &&
      (record.status === "present" ||
        record.status === "half_day" ||
        record.workedHours > 0);
    const leave = leaveByDate.get(date);
    if (leave != null && leave.paid + leave.unpaid > 0) {
      // At most one day of leave; unpaid halves count before paid ones.
      const unpaid = Math.min(2, Math.round(leave.unpaid * 2));
      const paid = Math.min(2 - unpaid, Math.round(leave.paid * 2));
      h.unpaidLeave += unpaid;
      h.paidLeave += paid;
      const rest = 2 - unpaid - paid;
      if (rest > 0) {
        if (worked) h.present += rest;
        else h.absent += rest;
      }
      continue;
    }

    switch (record?.status) {
      case "present":
        h.present += 2;
        break;
      case "half_day":
        h.halfDays += 2;
        break;
      case "on_leave": {
        const leaveHalves = record.leave?.half === true ? 1 : 2;
        if (record.leave?.paid === true) h.paidLeave += leaveHalves;
        else h.unpaidLeave += leaveHalves;
        if (leaveHalves === 1) {
          if (record.workedHours > 0) h.present += 1;
          else h.absent += 1;
        }
        break;
      }
      default:
        h.absent += 2;
    }
  }

  return {
    days: {
      workingDays: h.workingDays / 2,
      present: h.present / 2,
      // Whole days, each half absent (ADR CM-0012 §13).
      halfDays: h.halfDays / 2,
      absent: h.absent / 2,
      paidLeave: h.paidLeave / 2,
      unpaidLeave: h.unpaidLeave / 2,
      weekOff: h.weekOff / 2,
      holidays: h.holidays / 2,
      notEmployed: h.notEmployed / 2,
    },
    overtime,
    totalHours: hundredths / 100,
  };
}
