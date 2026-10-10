import {
  addDays,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/** One day of the "Labours present at site" series (CM-219). */
export type PresentDay = {
  date: CalendarDate;
  /** Labourers marked Present or Half Day. */
  present: number;
  /** Vendor heads: full + half day counts. */
  vendorHeadcount: number;
};

/** What the project Overview shows about labour (CM-219, `modules/08` dashboard). */
export type ProjectLabourSummary = {
  date: CalendarDate;
  labourers: {
    /** Active labourers whose current Project this is. */
    onProject: number;
    present: number;
    halfDay: number;
    absent: number;
    /** Leave or Holiday. */
    off: number;
    unmarked: number;
  };
  vendors: {
    /** Active vendors assigned to the Project. */
    assigned: number;
    recordedToday: number;
    headcountToday: number;
  };
  /** The last 14 days, or `from` to `date`; oldest first. */
  presentSeries: PresentDay[];
  /** Paise; balances of the Project's labourers (positive owed, negative advanced). */
  labourBalance: { toPay: number; advanced: number };
  vendorBalance: { toPay: number; advanced: number };
};

export const PRESENT_SERIES_DAYS = 14;

/** The longest series a caller may ask for: a year, leap day included. */
export const PRESENT_SERIES_MAX_DAYS = 366;

/**
 * The dates of the series ending on `date`: the last 14 days, or from
 * `from` (the Project Dashboard's duration, CM-412). 400
 * `SUMMARY_RANGE_INVALID` when `from` is after `date` or the range is
 * longer than 366 days.
 */
export function seriesDates(
  date: CalendarDate,
  from?: CalendarDate,
): CalendarDate[] {
  const days = from == null ? PRESENT_SERIES_DAYS : daysBetween(from, date) + 1;
  if (days < 1 || days > PRESENT_SERIES_MAX_DAYS)
    throw new DomainError(
      "SUMMARY_RANGE_INVALID",
      `Choose a start on or before the end date, at most ${String(PRESENT_SERIES_MAX_DAYS)} days earlier.`,
    );
  return Array.from({ length: days }, (_, index) =>
    addDays(date, index - days + 1),
  );
}

/** Splits balances into what is owed and what was advanced. */
export function splitBalances(balances: Iterable<number>): {
  toPay: number;
  advanced: number;
} {
  let toPay = 0;
  let advanced = 0;
  for (const balance of balances) {
    if (balance > 0) toPay += balance;
    else advanced -= balance;
  }
  return { toPay, advanced };
}
