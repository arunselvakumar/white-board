import { addDays, addMonths, type IsoDate } from "./dates";

export type AcademicYearSpan = {
  /** "2026–27", or "2026" when the year starts in January. */
  name: string;
  startsOn: IsoDate;
  endsOn: IsoDate;
};

/**
 * The Academic Year a date falls in.
 * @param startMonth 1–12; the Academic Year starts on the 1st of this month.
 */
export function academicYearFor(
  date: IsoDate,
  startMonth: number,
): AcademicYearSpan {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const startYear = month >= startMonth ? year : year - 1;
  const startsOn = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
  const endsOn = addDays(addMonths(startsOn, 12), -1);
  const name =
    startMonth === 1
      ? String(startYear)
      : `${startYear}–${String((startYear + 1) % 100).padStart(2, "0")}`;
  return { name, startsOn, endsOn };
}

/** The Academic Year after the one that starts on `startsOn`. */
export function nextAcademicYear(
  startsOn: IsoDate,
  startMonth: number,
): AcademicYearSpan {
  return academicYearFor(addMonths(startsOn, 12), startMonth);
}
