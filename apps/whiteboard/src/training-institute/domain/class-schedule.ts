// Pure Class scheduling shared by the server and the Calendar (ADR-0028).
// Weekly Timings produce Classes; Class Changes and Holidays are applied on read.
// Keep this file free of server-only imports: client components use it.

export type ScheduleSlot = {
  daysOfWeek: readonly number[];
  startTime: string;
  endTime: string;
};

export type ClassSlotTime = {
  date: string;
  startTime: string;
  endTime: string;
};

export type ClassChangeFact = {
  id: string;
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
  kind: "cancelled" | "moved";
  reason: string | null;
  movedTo: ClassSlotTime | null;
};

export type HolidayFact = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string | null;
};

export type ClassStatus = "scheduled" | "cancelled" | "moved" | "holiday";

export type ScheduledClass = {
  batchId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ClassStatus;
  /** True when this slot is the new time of a Moved Class. */
  rescheduled: boolean;
  reason: string | null;
  change: ClassChangeFact | null;
  holiday: HolidayFact | null;
};

export type ScheduleSource = {
  batchId: string;
  timings: readonly ScheduleSlot[];
  /** First local date this Batch or Enrollment has Classes, if bounded. */
  firstDate?: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function isClock(value: string): boolean {
  return CLOCK_RE.test(value);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000,
  );
}

export function clockMinutes(clock: string): number {
  const [hour, minute] = clock.split(":").map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

export type LocalNow = { date: string; minutes: number };

export function localNow(now: Date, timezone: string): LocalNow {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (name: string) =>
    parts.find((value) => value.type === name)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
  };
}

/** A Class has started once its local start time is reached. */
export function hasStarted(
  slot: { date: string; startTime: string },
  now: LocalNow,
): boolean {
  return (
    slot.date < now.date ||
    (slot.date === now.date && clockMinutes(slot.startTime) <= now.minutes)
  );
}

export function holidayOn(
  holidays: readonly HolidayFact[],
  date: string,
): HolidayFact | null {
  return (
    holidays.find(
      (holiday) => holiday.startDate <= date && date <= holiday.endDate,
    ) ?? null
  );
}

function regularSlot(
  source: ScheduleSource,
  date: string,
  startTime: string,
): ScheduleSlot | null {
  if (source.firstDate != null && date < source.firstDate) return null;
  const day = weekdayOf(date);
  return (
    source.timings.find(
      (slot) => slot.startTime === startTime && slot.daysOfWeek.includes(day),
    ) ?? null
  );
}

/**
 * Effective Classes for one Batch or Enrollment on a local date, ordered by
 * start time. Cancelled, Moved, and Holiday Classes are included with their
 * status so callers can show them; filter on `status === "scheduled"` for
 * Classes that will actually happen.
 */
export function classesOn(
  source: ScheduleSource,
  date: string,
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
): ScheduledClass[] {
  const holiday = holidayOn(holidays, date);
  const result: ScheduledClass[] = [];
  const seen = new Set<string>();
  if (source.firstDate == null || date >= source.firstDate) {
    const day = weekdayOf(date);
    for (const slot of source.timings) {
      if (!slot.daysOfWeek.includes(day) || seen.has(slot.startTime)) continue;
      seen.add(slot.startTime);
      const change =
        changes.find(
          (candidate) =>
            candidate.batchId === source.batchId &&
            candidate.date === date &&
            candidate.startTime === slot.startTime,
        ) ?? null;
      const status: ClassStatus =
        change?.kind === "moved"
          ? "moved"
          : holiday != null
            ? "holiday"
            : change != null
              ? "cancelled"
              : "scheduled";
      result.push({
        batchId: source.batchId,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status,
        rescheduled: false,
        reason:
          status === "holiday"
            ? (holiday?.reason ?? null)
            : (change?.reason ?? null),
        change,
        holiday: status === "holiday" ? holiday : null,
      });
    }
  }
  for (const change of changes) {
    const target = change.movedTo;
    if (
      change.kind !== "moved" ||
      target == null ||
      change.batchId !== source.batchId ||
      target.date !== date ||
      regularSlot(source, change.date, change.startTime) == null
    )
      continue;
    result.push({
      batchId: source.batchId,
      date,
      startTime: target.startTime,
      endTime: target.endTime,
      status: holiday != null ? "holiday" : "scheduled",
      rescheduled: true,
      reason: holiday != null ? holiday.reason : change.reason,
      change,
      holiday,
    });
  }
  return result.sort(
    (a, b) => clockMinutes(a.startTime) - clockMinutes(b.startTime),
  );
}

/**
 * Upcoming Moved Classes whose original slot no longer exists in any of these
 * Timings. Their Rescheduled slot would silently disappear (ADR-0028), so
 * Timing edits that produce any are refused.
 */
export function orphanedMoves(
  changes: readonly ClassChangeFact[],
  sources: readonly ScheduleSource[],
  now: LocalNow,
): ClassChangeFact[] {
  return changes.filter(
    (change) =>
      change.kind === "moved" &&
      change.movedTo != null &&
      !hasStarted(change.movedTo, now) &&
      !sources.some(
        (source) =>
          source.batchId === change.batchId &&
          regularSlot(source, change.date, change.startTime) != null,
      ),
  );
}

/** The Class at a start time on a date, original or Rescheduled. */
export function classAt(
  source: ScheduleSource,
  key: { date: string; startTime: string },
  changes: readonly ClassChangeFact[],
  holidays: readonly HolidayFact[],
): ScheduledClass | null {
  const matches = classesOn(source, key.date, changes, holidays).filter(
    (scheduled) => scheduled.startTime === key.startTime,
  );
  return (
    matches.find((scheduled) => scheduled.status === "scheduled") ??
    matches[0] ??
    null
  );
}
