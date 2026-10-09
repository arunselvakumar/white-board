import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";

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
  /** The last 14 days, oldest first. */
  presentSeries: PresentDay[];
  /** Paise; balances of the Project's labourers (positive owed, negative advanced). */
  labourBalance: { toPay: number; advanced: number };
  vendorBalance: { toPay: number; advanced: number };
};

export const PRESENT_SERIES_DAYS = 14;

/** The dates of the series ending on `date`. */
export function seriesDates(date: CalendarDate): CalendarDate[] {
  return Array.from({ length: PRESENT_SERIES_DAYS }, (_, index) =>
    addDays(date, index - PRESENT_SERIES_DAYS + 1),
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
