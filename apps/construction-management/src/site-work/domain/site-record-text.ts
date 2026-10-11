import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * Text and date rules shared by the Site Diary and the Hindrance register
 * (CM-607). Every refusal is a 400 naming its field in `details.field`.
 */

function tooLong(field: string, max: number): DomainError {
  return new DomainError(
    "TEXT_TOO_LONG",
    `Use at most ${String(max)} characters.`,
    {
      details: { field },
    },
  );
}

/** Optional text: trimmed, empty is null, at most `max` characters. */
export function optionalLine(
  raw: string | null | undefined,
  field: string,
  max: number,
): string | null {
  const text = raw?.trim() ?? "";
  if (text.length > max) throw tooLong(field, max);
  return text === "" ? null : text;
}

/** Required text: trimmed, not empty, at most `max` characters. */
export function requiredLine(
  raw: string | null | undefined,
  code: string,
  message: string,
  field: string,
  max: number,
): string {
  const text = raw?.trim() ?? "";
  if (text === "") throw new DomainError(code, message, { details: { field } });
  if (text.length > max) throw tooLong(field, max);
  return text;
}

/** A `YYYY-MM-DD` date that is not after the Company's today. */
export function pastOrToday(
  raw: string,
  codes: { invalid: string; future: string },
  field: string,
  today: CalendarDate,
): CalendarDate {
  const code = codes.invalid;
  let date: CalendarDate;
  try {
    date = assertCalendarDate(raw, code);
  } catch {
    throw new DomainError(code, "Enter a date as YYYY-MM-DD.", {
      details: { field },
    });
  }
  if (date > today)
    throw new DomainError(codes.future, "Choose today or an earlier date.", {
      details: { field },
    });
  return date;
}

/**
 * A non-negative decimal with at most `scale` decimals and `digits` whole
 * digits, as a canonical string ("12.50" → "12.5"); empty is null.
 */
export function optionalDecimal(
  raw: string | number | null | undefined,
  options: { code: string; field: string; scale: number; digits: number },
): string | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const refuse = () =>
    new DomainError(
      options.code,
      `Enter 0 or more, with at most ${String(options.scale)} ${options.scale === 1 ? "decimal" : "decimals"}.`,
      { details: { field: options.field } },
    );
  if (!/^\d{1,20}(\.\d{1,20})?$/.test(text)) throw refuse();
  const [whole = "0", fraction = ""] = text.split(".");
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
  const trimmedFraction = fraction.replace(/0+$/, "");
  if (
    trimmedWhole.length > options.digits ||
    trimmedFraction.length > options.scale
  )
    throw refuse();
  return trimmedFraction === ""
    ? trimmedWhole
    : `${trimmedWhole}.${trimmedFraction}`;
}
