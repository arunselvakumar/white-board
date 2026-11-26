// Calendar dates are "YYYY-MM-DD" strings. Every Centre is in India, so
// "today" is the date in Asia/Kolkata.

const INDIA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type IsoDate = string;

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

/** The calendar date of a UTC-midnight `Date`, as Prisma returns for `@db.Date`. */
export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** A UTC-midnight `Date` for a `@db.Date` column. */
export function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function todayInIndia(now: Date): IsoDate {
  return new Date(now.getTime() + INDIA_OFFSET_MS).toISOString().slice(0, 10);
}

/** "HH:mm" in India for an instant. */
export function timeInIndia(instant: Date): string {
  return new Date(instant.getTime() + INDIA_OFFSET_MS)
    .toISOString()
    .slice(11, 16);
}

/** The instant of "HH:mm" India time on a calendar date. */
export function instantInIndia(date: IsoDate, time: string): Date {
  return new Date(new Date(`${date}T${time}:00Z`).getTime() - INDIA_OFFSET_MS);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(fromIsoDate(date).getTime() + days * DAY_MS));
}

/** Adds calendar months, clamping the day to the target month's last day. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const targetMonthIndex = month - 1 + months;
  const lastDay = new Date(
    Date.UTC(year, targetMonthIndex + 1, 0),
  ).getUTCDate();
  return toIsoDate(
    new Date(Date.UTC(year, targetMonthIndex, Math.min(day, lastDay))),
  );
}

/** Completed months between a date of birth and a date. Never negative. */
export function ageInMonths(dateOfBirth: IsoDate, on: IsoDate): number {
  const [birthYear, birthMonth, birthDay] = dateOfBirth
    .split("-")
    .map(Number) as [number, number, number];
  const [year, month, day] = on.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const months =
    (year - birthYear) * 12 + (month - birthMonth) - (day < birthDay ? 1 : 0);
  return Math.max(0, months);
}

/** "3 y 4 m", "11 m". */
export function formatAge(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} m`;
  return rest === 0 ? `${years} y` : `${years} y ${rest} m`;
}
