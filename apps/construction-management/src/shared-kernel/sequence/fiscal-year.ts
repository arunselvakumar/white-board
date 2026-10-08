import { assertCalendarDate, type CalendarDate } from "../calendar-date";

/** An Indian fiscal year, 1 April to 31 March. */
export type FiscalYear = {
  /** The calendar year it starts in: 2026 for 1 April 2026 – 31 March 2027. */
  startYear: number;
  /** `26-27`. */
  label: string;
};

function twoDigits(year: number): string {
  return String(year % 100).padStart(2, "0");
}

export function fiscalYearStarting(startYear: number): FiscalYear {
  return {
    startYear,
    label: `${twoDigits(startYear)}-${twoDigits(startYear + 1)}`,
  };
}

/** The fiscal year a calendar date (in the Company time zone) falls in. */
export function fiscalYearOf(date: CalendarDate): FiscalYear {
  const [year, month] = assertCalendarDate(date).split("-").map(Number);
  const calendarYear = year ?? 0;
  return fiscalYearStarting(
    (month ?? 1) >= 4 ? calendarYear : calendarYear - 1,
  );
}
