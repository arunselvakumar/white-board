import {
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * A Company holiday (CM-305, `modules/10` "Holiday"). One holiday per date
 * per Company. An **optional** holiday is shown on the calendar but is a
 * working day unless the member takes it as leave (ADR CM-0012 §11); every
 * other holiday is a day off for everyone, and paid (the "Holidays" column
 * of the salary slip).
 */

export const HOLIDAY_TYPES = ["national", "festival", "company"] as const;

export type HolidayType = (typeof HOLIDAY_TYPES)[number];

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  national: "National",
  festival: "Festival",
  company: "Company",
};

export const HOLIDAY_LIMITS = {
  maxNameLength: 80,
  maxDescriptionLength: 500,
  /** Years a holiday list may be kept for. */
  minYear: 2000,
  maxYear: 2100,
} as const;

export type HolidayDetails = Readonly<{
  name: string;
  date: CalendarDate;
  type: HolidayType;
  isOptional: boolean;
  description: string | null;
}>;

export type HolidayInput = {
  name: string;
  date: string;
  type: string;
  isOptional: boolean;
  description?: string | null;
};

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

export function isHolidayType(value: string): value is HolidayType {
  return (HOLIDAY_TYPES as readonly string[]).includes(value);
}

/** A holiday type as typed in a sheet (`National`, `festival`…), or null. */
export function holidayTypeFromLabel(value: string): HolidayType | null {
  const lowered = value.trim().toLowerCase();
  return isHolidayType(lowered) ? lowered : null;
}

/** The year a date's holiday list is kept under. */
export function holidayYear(date: CalendarDate): number {
  return Number(date.slice(0, 4));
}

/**
 * Validates and normalises a holiday. Throws a `DomainError` whose
 * `details.field` names the field at fault. Duplicate dates are the
 * store's to refuse (`holidayDateTaken`), since they depend on the other
 * holidays.
 */
export function createHoliday(input: HolidayInput): HolidayDetails {
  const name = input.name.trim();
  if (name === "")
    throw invalid("HOLIDAY_NAME_REQUIRED", "Enter the holiday name.", "name");
  if (name.length > HOLIDAY_LIMITS.maxNameLength)
    throw invalid(
      "HOLIDAY_NAME_TOO_LONG",
      `Use at most ${String(HOLIDAY_LIMITS.maxNameLength)} characters.`,
      "name",
    );
  const date = input.date.trim();
  if (!isCalendarDate(date))
    throw invalid("HOLIDAY_DATE_INVALID", "Enter a real date.", "date");
  const year = holidayYear(date);
  if (year < HOLIDAY_LIMITS.minYear || year > HOLIDAY_LIMITS.maxYear)
    throw invalid(
      "HOLIDAY_DATE_INVALID",
      `Choose a date from ${String(HOLIDAY_LIMITS.minYear)} to ${String(HOLIDAY_LIMITS.maxYear)}.`,
      "date",
    );
  if (!isHolidayType(input.type))
    throw invalid(
      "HOLIDAY_TYPE_INVALID",
      "Choose National, Festival or Company.",
      "type",
    );
  const description = input.description?.trim() ?? "";
  if (description.length > HOLIDAY_LIMITS.maxDescriptionLength)
    throw invalid(
      "HOLIDAY_DESCRIPTION_TOO_LONG",
      `Use at most ${String(HOLIDAY_LIMITS.maxDescriptionLength)} characters.`,
      "description",
    );
  return Object.freeze({
    name,
    date,
    type: input.type,
    isOptional: input.isOptional,
    description: description === "" ? null : description,
  });
}

/** 409: another holiday is already on that date. */
export function holidayDateTaken(date: CalendarDate, name: string) {
  return new DomainError(
    "HOLIDAY_DATE_TAKEN",
    `${date} is already a holiday (${name}). A date can hold one holiday.`,
    { kind: "conflict", details: { field: "date", date } },
  );
}

/** Whether a holiday makes its date a day off (optional ones do not). */
export function isDayOff(holiday: { isOptional: boolean }): boolean {
  return !holiday.isOptional;
}

/** Dates that appear more than once, e.g. in an import sheet. */
export function repeatedDates(dates: readonly CalendarDate[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const date of dates) {
    if (seen.has(date)) repeated.add(date);
    seen.add(date);
  }
  return repeated;
}
