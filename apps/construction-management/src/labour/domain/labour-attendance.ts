import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { MAX_PAISE } from "./labour";
import { assertAmountFits, type NewLedgerEntry } from "./ledger";
import {
  MAX_OVERTIME_HOURS_PER_DAY,
  dayEarned,
  hoursInHundredths,
  overtimeAmount,
  overtimeHours,
  type AttendanceStatus,
  type WageType,
} from "./wages";

const OVERTIME_TOO_LARGE =
  "A Labour's overtime for one day is at most ₹21,47,48,364. Check the overtime rate.";

/** One overtime line as a supervisor enters it. */
export type OvertimeInput = {
  labourCategoryId: string | null;
  /** Decimal hours, 0 < h ≤ 24, two places at most. */
  hours: string | number;
  /** Paise per hour; defaults to the labourer's overtime wage. */
  ratePerHour?: number | null;
};

/** One labourer's day as the marking screen sends it. */
export type DayMark = {
  labourId: string;
  status: AttendanceStatus;
  isPaidLeave?: boolean;
  shift?: string | null;
  supervisorId?: string | null;
  overtime?: readonly OvertimeInput[];
};

/** What the day is priced from: the labourer's current wages. */
export type WageCard = {
  wageType: WageType;
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number;
};

export type PricedOvertime = {
  labourCategoryId: string | null;
  hours: string;
  ratePerHour: number;
  amount: number;
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
  wageType: WageType;
  wageRate: number;
  earned: number;
  overtime: PricedOvertime[];
};

const SHIFT_MAX = 40;

/**
 * Prices one labourer's day (CM-210, `modules/08` "Decisions for the
 * build"): validates the status, paid leave and overtime, snapshots the
 * wage, and works out what the day pays.
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

  const lines = mark.overtime ?? [];
  if (lines.length > 0 && mark.status === "absent")
    throw new DomainError(
      "OVERTIME_ON_ABSENT_DAY",
      "An Absent Labour cannot have overtime on that day.",
    );
  const overtime = lines.map((line) => {
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
