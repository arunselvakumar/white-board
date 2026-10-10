/**
 * Leave is counted in days with up to two decimals (an accrual credit of
 * 1.25, a half day of 0.5). Sums are done in hundredths so floats never
 * drift (`0.58 × 12` is 6.96, not 6.959999…). The database stores
 * `decimal(6,2)`.
 */

/** The largest number of days one row can hold (`decimal(6,2)`). */
export const MAX_LEAVE_DAYS = 9999.99;

export function toHundredths(days: number): number {
  return Math.round(days * 100);
}

export function fromHundredths(hundredths: number): number {
  return hundredths / 100;
}

/** The exact sum of `values`, to two decimals. */
export function sumDays(values: readonly number[]): number {
  return fromHundredths(
    values.reduce((total, value) => total + toHundredths(value), 0),
  );
}

/** `a - b`, to two decimals. */
export function subtractDays(a: number, b: number): number {
  return fromHundredths(toHundredths(a) - toHundredths(b));
}

export function minDays(...values: number[]): number {
  return fromHundredths(Math.min(...values.map(toHundredths)));
}

/** At most two decimal places, compared without float noise. */
export function hasTwoDecimals(value: number): boolean {
  return (
    Number.isFinite(value) &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-9
  );
}

/** A whole or half day count (leave taken is always in halves). */
export function isHalfDayStep(value: number): boolean {
  return (
    Number.isFinite(value) && Math.abs(value * 2 - Math.round(value * 2)) < 1e-9
  );
}

/** "1 day", "2.5 days", "0.58 days". */
export function formatLeaveDays(days: number): string {
  const text = String(fromHundredths(toHundredths(days)));
  return `${text} ${days === 1 ? "day" : "days"}`;
}
