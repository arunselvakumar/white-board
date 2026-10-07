import { QueryHttpError } from "@/src/queries/http";
import type {
  ClassDateView,
  PostedByView,
} from "@/src/training-institute/application/class-work-views";

function utcDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** "Mon, 5 Oct" for a YYYY-MM-DD calendar date. */
export function dayDate(key: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(utcDate(key));
}

/** "Monday" for a YYYY-MM-DD calendar date. */
function weekdayName(key: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    timeZone: "UTC",
  }).format(utcDate(key));
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000,
  );
}

/** "Set after Monday's Class" while the Class is in the last week. */
export function setAfterPhrase(
  classDate: string,
  today: string,
): string | null {
  const ago = daysBetween(classDate, today);
  if (ago === 0) return "Set after today’s Class";
  if (ago === 1) return "Set after yesterday’s Class";
  if (ago > 1 && ago <= 6) return `Set after ${weekdayName(classDate)}’s Class`;
  return null;
}

/** "5 Oct, 3:45 pm" for a timestamp, in the Batch's timezone. */
export function timestampLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(new Date(iso));
}

export function postedByLabel(postedBy: PostedByView): string {
  if (postedBy.role === "owner") return "Owner";
  return postedBy.teacherName ?? "Teacher";
}

export type ClassDateOption = { value: string; label: string };

/**
 * One option per date, newest first, with every Class time on that date.
 * `keep` is a stored Class date that must stay selectable while editing.
 */
export function classDateOptions(
  classDates: readonly ClassDateView[],
  today: string,
  keep: string | null = null,
): ClassDateOption[] {
  const times = new Map<string, string[]>();
  for (const item of classDates) {
    const list = times.get(item.date) ?? [];
    const range = `${item.startTime}–${item.endTime}`;
    if (!list.includes(range)) list.push(range);
    times.set(item.date, list);
  }
  if (keep != null && !times.has(keep)) times.set(keep, []);
  return [...times.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, ranges]) => {
      const day = `${dayDate(date)}${date === today ? " (today)" : ""}`;
      return {
        value: date,
        label: ranges.length === 0 ? day : `${day} · ${ranges.join(", ")}`,
      };
    });
}

/** The server's ErrorEnvelope message, else a friendly fallback. */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof QueryHttpError) return error.message || fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function errorCode(error: unknown): string | null {
  return error instanceof QueryHttpError ? error.code : null;
}
