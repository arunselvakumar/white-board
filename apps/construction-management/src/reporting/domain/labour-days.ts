import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

/**
 * The labour context's attendance as the reports read it: plain rows from
 * its tables (reporting is a read model and never imports that context).
 */
export type AttendanceStatus =
  "present" | "half_day" | "absent" | "on_leave" | "holiday";

export type WageType = "daily" | "monthly";

export type ReportLabour = {
  id: string;
  name: string;
  labourCode: string | null;
  fatherName: string | null;
  category: string | null;
  gender: "male" | "female" | "other" | null;
  /** The Labour's current wage, for a register row with no marked day. */
  wageType: WageType;
  /** Paise per day or per month, by `wageType`. */
  wageRate: number;
};

/** One marked day, with its wage snapshot (ADR CM-0004). */
export type ReportLabourDay = {
  labourId: string;
  date: CalendarDate;
  status: AttendanceStatus;
  isPaidLeave: boolean;
  shift: string | null;
  supervisor: string | null;
  /** Overtime on the day in hundredths of an hour (2.5 h = 250). */
  overtimeHundredths: number;
  wageType: WageType;
  /** Paise, as on the day it was marked. */
  wageRate: number;
  /** Paise the day pays before overtime. */
  earned: number;
  /** Paise of the day's overtime lines. */
  overtimeAmount: number;
};

/** P, ½, A, L (unpaid leave), PL (paid leave), H (holiday). */
export type DayMark = "P" | "½" | "A" | "L" | "PL" | "H";

export function markOf(
  day: Pick<ReportLabourDay, "status" | "isPaidLeave">,
): DayMark {
  switch (day.status) {
    case "present":
      return "P";
    case "half_day":
      return "½";
    case "absent":
      return "A";
    case "on_leave":
      return day.isPaidLeave ? "PL" : "L";
    case "holiday":
      return "H";
  }
}

export const MARK_LEGEND =
  "P present, ½ half day, A absent, L leave, PL paid leave, H holiday; a blank day was not marked.";

export type DayTally = {
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  paidLeave: number;
  holiday: number;
  overtimeHundredths: number;
  earned: number;
  overtimeAmount: number;
};

export function emptyTally(): DayTally {
  return {
    present: 0,
    halfDay: 0,
    absent: 0,
    leave: 0,
    paidLeave: 0,
    holiday: 0,
    overtimeHundredths: 0,
    earned: 0,
    overtimeAmount: 0,
  };
}

export function tally(days: readonly ReportLabourDay[]): DayTally {
  const sum = emptyTally();
  for (const day of days) {
    switch (markOf(day)) {
      case "P":
        sum.present += 1;
        break;
      case "½":
        sum.halfDay += 1;
        break;
      case "A":
        sum.absent += 1;
        break;
      case "L":
        sum.leave += 1;
        break;
      case "PL":
        sum.paidLeave += 1;
        break;
      case "H":
        sum.holiday += 1;
        break;
    }
    sum.overtimeHundredths += day.overtimeHundredths;
    sum.earned += day.earned;
    sum.overtimeAmount += day.overtimeAmount;
  }
  return sum;
}

/** Days worked: present + ½ × half days. */
export function daysWorked(sum: DayTally): number {
  return sum.present + sum.halfDay / 2;
}

/**
 * Paid days under the M2 wage rules (`modules/08` decisions): present 1,
 * half day ½, paid leave 1, and a holiday 1 only on a monthly wage.
 */
export function paidDays(days: readonly ReportLabourDay[]): number {
  let halves = 0;
  for (const day of days) {
    const mark = markOf(day);
    if (mark === "P" || mark === "PL") halves += 2;
    else if (mark === "½") halves += 1;
    else if (mark === "H" && day.wageType === "monthly") halves += 2;
  }
  return halves / 2;
}

/** Hundredths of an hour as hours: 250 → 2.5. */
export function hours(hundredths: number): number {
  return hundredths / 100;
}

/** A Postgres `numeric` hours value (`"2.50"`) in hundredths. */
export function hundredthsOf(value: string | number): number {
  return Math.round(Number(value) * 100);
}

/** `P`, `P+2`, `H+1.5`. */
export function markWithOvertime(day: ReportLabourDay): string {
  const mark = markOf(day);
  if (day.overtimeHundredths <= 0) return mark;
  return `${mark}+${String(hours(day.overtimeHundredths))}`;
}

/** Labours by name, then Labour Id. */
export function byName<T extends { name: string; labourCode: string | null }>(
  a: T,
  b: T,
): number {
  return (
    a.name.localeCompare(b.name, "en", {
      sensitivity: "base",
      numeric: true,
    }) || (a.labourCode ?? "").localeCompare(b.labourCode ?? "")
  );
}

/** The days of each Labour, keyed by Labour then date. */
export function daysByLabour(
  days: readonly ReportLabourDay[],
): Map<string, Map<CalendarDate, ReportLabourDay>> {
  const map = new Map<string, Map<CalendarDate, ReportLabourDay>>();
  for (const day of days) {
    const own =
      map.get(day.labourId) ?? new Map<CalendarDate, ReportLabourDay>();
    own.set(day.date, day);
    map.set(day.labourId, own);
  }
  return map;
}
