import {
  classesOn,
  type ClassChangeFact,
  type HolidayFact,
  type ScheduledClass,
} from "@/src/training-institute/domain/class-schedule";

export type DateKey = string;
export type CalendarEvent<T> = {
  id: string;
  date: DateKey;
  startMinutes: number;
  endMinutes: number;
  item: T;
  /** The Class after Class Changes and Holidays are applied. */
  scheduled: ScheduledClass;
};

export type CalendarExceptions = {
  classChanges: readonly ClassChangeFact[];
  holidays: readonly HolidayFact[];
};

const NO_EXCEPTIONS: CalendarExceptions = { classChanges: [], holidays: [] };

function utcDate(key: DateKey): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function keyOf(date: Date): DateKey {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = utcDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return keyOf(date);
}

export function addMonths(key: DateKey, months: number): DateKey {
  const date = utcDate(key);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return keyOf(date);
}

export function weekday(key: DateKey): number {
  return utcDate(key).getUTCDay();
}

export function weekDates(key: DateKey): DateKey[] {
  const sunday = addDays(key, -weekday(key));
  return Array.from({ length: 7 }, (_, index) => addDays(sunday, index));
}

export function monthGrid(key: DateKey): DateKey[] {
  const first = `${key.slice(0, 7)}-01`;
  const sunday = weekDates(first)[0] ?? first;
  return Array.from({ length: 42 }, (_, index) => addDays(sunday, index));
}

export function dateKeyInZone(date: Date, timezone: string): DateKey {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (name: string) =>
    parts.find((part) => part.type === name)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function minutesFromClock(clock: string): number {
  const [hour, minute] = clock.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export function expandCalendarItems<
  T extends {
    id: string;
    batchId: string;
    timezone: string;
    activeFrom: string;
    timings: {
      daysOfWeek: readonly number[];
      startTime: string;
      endTime: string;
    }[];
  },
>(
  items: T[],
  dates: DateKey[],
  exceptions: CalendarExceptions = NO_EXCEPTIONS,
): CalendarEvent<T>[] {
  const events: CalendarEvent<T>[] = [];
  for (const item of items) {
    const source = {
      batchId: item.batchId,
      timings: item.timings,
      firstDate: dateKeyInZone(new Date(item.activeFrom), item.timezone),
    };
    for (const date of dates) {
      for (const scheduled of classesOn(
        source,
        date,
        exceptions.classChanges,
        exceptions.holidays,
      )) {
        events.push({
          id: `${item.id}:${date}:${scheduled.startTime}${scheduled.rescheduled ? ":rescheduled" : ""}`,
          date,
          startMinutes: minutesFromClock(scheduled.startTime),
          endMinutes: minutesFromClock(scheduled.endTime),
          item,
          scheduled,
        });
      }
    }
  }
  return events.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startMinutes - b.startMinutes ||
      a.item.id.localeCompare(b.item.id),
  );
}

export function formatDate(
  key: DateKey,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    ...options,
  }).format(utcDate(key));
}
