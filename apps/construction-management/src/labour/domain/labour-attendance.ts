import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { MAX_PAISE } from "./labour";
import { assertAmountFits, type NewLedgerEntry } from "./ledger";
import {
  DEFAULT_BREAK_MINUTES,
  MAX_OVERTIME_HOURS_PER_DAY,
  assertBreakMinutes,
  dayEarned,
  hoursFromTimes,
  hoursInHundredths,
  overtimeAmount,
  overtimeHours,
  timeOfDay,
  workingHours,
  type AttendanceStatus,
  type WageType,
} from "./wages";

const OVERTIME_TOO_LARGE =
  "A Labour's overtime for one day is at most ₹21,47,48,364. Check the overtime rate.";

/** One overtime line as a supervisor enters it. */
export type OvertimeInput = {
  labourCategoryId: string | null;
  /**
   * Decimal hours, 0 < h ≤ 24, two places at most. Ignored on the line
   * worked out from the times (`fromTimes`).
   */
  hours?: string | number | null;
  /** Paise per hour; defaults to the labourer's overtime wage. */
  ratePerHour?: number | null;
  /**
   * The line's hours are the time worked beyond the working hours, from
   * check-in, check-out and the break (ADR CM-0011). At most one per day;
   * dropped while the day has no check-out or no extra time.
   */
  fromTimes?: boolean;
};

/** One labourer's day as the marking screen sends it. */
export type DayMark = {
  labourId: string;
  status: AttendanceStatus;
  isPaidLeave?: boolean;
  shift?: string | null;
  supervisorId?: string | null;
  /** `HH:MM`, Company time; only on Present or Half Day. */
  checkIn?: string | null;
  /** `HH:MM`; needs a check-in. At or before the check-in is the next day. */
  checkOut?: string | null;
  /** Unpaid break in minutes, 0–720; 60 when left out and there is a check-in. */
  breakMinutes?: number | null;
  overtime?: readonly OvertimeInput[];
};

/** What the day is priced from: the labourer's current wages. */
export type WageCard = {
  wageType: WageType;
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number;
  /** Decimal hours a day; time worked beyond it is overtime. */
  workingHours: string;
};

export type PricedOvertime = {
  labourCategoryId: string | null;
  hours: string;
  ratePerHour: number;
  amount: number;
  /** Hours worked out from the day's times. */
  fromTimes: boolean;
};

/** A day ready to store: the row, its overtime lines and its money. */
export type PricedDay = {
  labourId: string;
  projectId: string;
  date: CalendarDate;
  status: AttendanceStatus;
  isPaidLeave: boolean;
  shift: string | null;
  supervisorId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  /** Null without a check-in. */
  breakMinutes: number | null;
  /** Snapshot of the Labour's working hours a day. */
  workingHours: string;
  wageType: WageType;
  wageRate: number;
  earned: number;
  overtime: PricedOvertime[];
};

/** Statuses that may carry check-in and check-out times. */
const TIMED_STATUSES: readonly AttendanceStatus[] = ["present", "half_day"];

type DayTimes = {
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number | null;
  /** Hours beyond the working hours, when both times are in. */
  extra: string | null;
};

/** Validates a day's check-in, check-out and break (ADR CM-0011). */
function dayTimes(mark: DayMark, workingHours: string): DayTimes {
  const checkIn =
    mark.checkIn == null || mark.checkIn.trim() === ""
      ? null
      : timeOfDay(mark.checkIn, "checkIn");
  const checkOut =
    mark.checkOut == null || mark.checkOut.trim() === ""
      ? null
      : timeOfDay(mark.checkOut, "checkOut");
  if (checkIn == null && checkOut == null)
    return { checkIn, checkOut, breakMinutes: null, extra: null };
  if (!TIMED_STATUSES.includes(mark.status))
    throw new DomainError(
      "TIMES_NEED_PRESENT",
      "Check-in and check-out are only for a Present or Half Day.",
      { details: { field: "checkIn" } },
    );
  if (checkIn == null)
    throw new DomainError(
      "CHECK_IN_REQUIRED",
      "Enter the check-in time before the check-out.",
      { details: { field: "checkIn" } },
    );
  const breakMinutes = mark.breakMinutes ?? DEFAULT_BREAK_MINUTES;
  assertBreakMinutes(breakMinutes);
  if (checkOut == null) return { checkIn, checkOut, breakMinutes, extra: null };
  if (checkOut === checkIn)
    throw new DomainError(
      "CHECK_OUT_SAME_AS_CHECK_IN",
      "Check-out cannot be the same time as check-in.",
      { details: { field: "checkOut" } },
    );
  const { extra } = hoursFromTimes({
    checkIn,
    checkOut,
    breakMinutes,
    workingHours,
  });
  return { checkIn, checkOut, breakMinutes, extra };
}

const SHIFT_MAX = 40;

/**
 * Prices one labourer's day (CM-210, `modules/08` "Decisions for the
 * build"): validates the status, paid leave, times and overtime, snapshots
 * the wage and working hours, and works out what the day pays. Overtime
 * from the times (ADR CM-0011) is worked out here, so the server is the
 * one source of those hours.
 */
export function priceDay(input: {
  mark: DayMark;
  card: WageCard;
  projectId: string;
  date: CalendarDate;
}): PricedDay {
  const { mark, card } = input;
  const isPaidLeave = mark.isPaidLeave ?? false;
  if (isPaidLeave && mark.status !== "on_leave")
    throw new DomainError(
      "PAID_LEAVE_NEEDS_LEAVE",
      "Only an On Leave day can be marked Paid Leave.",
    );
  const wageRate =
    card.wageType === "daily" ? card.wagePerDay : card.wagePerMonth;
  if (wageRate == null)
    throw new DomainError(
      "WAGE_REQUIRED",
      "This Labour has no wage for their wage type.",
    );
  const shift = mark.shift?.trim() ?? "";
  if (shift.length > SHIFT_MAX)
    throw new DomainError(
      "SHIFT_TOO_LONG",
      `A shift name is at most ${String(SHIFT_MAX)} characters.`,
    );

  const times = dayTimes(mark, card.workingHours);
  const sent = mark.overtime ?? [];
  if (sent.filter((line) => line.fromTimes === true).length > 1)
    throw new DomainError(
      "OVERTIME_FROM_TIMES_TWICE",
      "Only one overtime line can come from the check-in and check-out times.",
    );
  // The line from the times takes the extra hours, or drops out when
  // there are none yet (no check-out, or no time beyond the working hours).
  const lines = sent.flatMap((line) =>
    line.fromTimes === true
      ? times.extra == null
        ? []
        : [{ ...line, hours: times.extra }]
      : [line],
  );
  if (lines.length > 0 && mark.status === "absent")
    throw new DomainError(
      "OVERTIME_ON_ABSENT_DAY",
      "An Absent Labour cannot have overtime on that day.",
    );
  const overtime = lines.map((line) => {
    if (line.hours == null) throw invalidOvertimeHours();
    const hours = overtimeHours(line.hours);
    const ratePerHour = line.ratePerHour ?? card.overtimeWagePerHour;
    if (
      !Number.isSafeInteger(ratePerHour) ||
      ratePerHour < 0 ||
      ratePerHour > MAX_PAISE
    )
      throw new DomainError(
        "OVERTIME_RATE_INVALID",
        "The overtime rate must be zero or more, up to ₹2,00,00,000 an hour.",
      );
    const amount = overtimeAmount(hours, ratePerHour);
    assertAmountFits(amount, OVERTIME_TOO_LARGE);
    return {
      labourCategoryId: line.labourCategoryId,
      hours,
      ratePerHour,
      amount,
      fromTimes: line.fromTimes === true,
    };
  });
  assertAmountFits(
    overtime.reduce((sum, line) => sum + line.amount, 0),
    OVERTIME_TOO_LARGE,
  );
  const totalHundredths = overtime.reduce(
    (sum, line) => sum + hoursInHundredths(line.hours),
    0,
  );
  if (totalHundredths > MAX_OVERTIME_HOURS_PER_DAY * 100)
    throw new DomainError(
      "OVERTIME_HOURS_INVALID",
      "A Labour's overtime adds up to at most 24 hours a day.",
    );

  return {
    labourId: mark.labourId,
    projectId: input.projectId,
    date: input.date,
    status: mark.status,
    isPaidLeave,
    shift: shift.length === 0 ? null : shift,
    supervisorId: mark.supervisorId ?? null,
    checkIn: times.checkIn,
    checkOut: times.checkOut,
    breakMinutes: times.breakMinutes,
    workingHours: workingHours(card.workingHours),
    wageType: card.wageType,
    wageRate,
    earned: dayEarned({
      wageType: card.wageType,
      wageRate,
      status: mark.status,
      isPaidLeave,
      date: input.date,
    }),
    overtime,
  };
}

function invalidOvertimeHours(): DomainError {
  return new DomainError(
    "OVERTIME_HOURS_INVALID",
    "Overtime hours must be more than 0 and at most 24, in steps of 0.01.",
  );
}

/**
 * Re-prices a stored day when only Paid Leave changes ("Mark Paid Leave"):
 * the snapshot wage stays, overtime stays.
 */
export function withPaidLeave(day: PricedDay, isPaidLeave: boolean): PricedDay {
  if (day.status !== "on_leave")
    throw new DomainError(
      "PAID_LEAVE_NEEDS_LEAVE",
      "Only an On Leave day can be marked Paid Leave.",
    );
  return {
    ...day,
    isPaidLeave,
    earned: dayEarned({
      wageType: day.wageType,
      wageRate: day.wageRate,
      status: day.status,
      isPaidLeave,
      date: day.date,
    }),
  };
}

/** The ledger entries a priced day posts (ADR CM-0004). */
export function dayLedgerEntries(
  day: PricedDay,
  attendanceId: string,
): NewLedgerEntry[] {
  const base = {
    partyType: "labour" as const,
    partyId: day.labourId,
    projectId: day.projectId,
    entryDate: day.date,
    sourceType: "labour_attendance" as const,
    sourceId: attendanceId,
    reversesEntryId: null,
  };
  const overtime = day.overtime.reduce((sum, line) => sum + line.amount, 0);
  return [
    { ...base, kind: "earned", amount: day.earned },
    { ...base, kind: "overtime", amount: overtime },
  ];
}

/** Marking many labourers in one command: each at most once. */
export function assertDistinctLabourers(marks: readonly DayMark[]): void {
  const seen = new Set<string>();
  for (const mark of marks) {
    if (seen.has(mark.labourId))
      throw new DomainError(
        "LABOUR_MARKED_TWICE",
        "A Labour appears twice in this attendance.",
        { details: { labourId: mark.labourId } },
      );
    seen.add(mark.labourId);
  }
  if (marks.length === 0)
    throw new DomainError(
      "ATTENDANCE_EMPTY",
      "Choose at least one Labour to mark.",
    );
}
