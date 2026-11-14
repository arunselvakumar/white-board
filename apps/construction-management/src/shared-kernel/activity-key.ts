import { createHash } from "node:crypto";

import { isCalendarDate, type CalendarDate } from "./calendar-date";
import { DomainError } from "./domain-error";
import { isUuid } from "./ids";

/** Entries in one page of an Activity feed (ADR CM-0038 §1). */
export const ACTIVITY_PAGE_SIZE = 30;

/**
 * Where an entry sits in an Activity feed (ADR CM-0038 §1): the effective
 * date (newest first), then the recorded time, then the kind's rank, then
 * the source row's id, so the order is total. Every component sorts
 * descending, so "after the cursor" is a smaller tuple; SQL sources compare
 * `(date, recorded_at, rank, id::uuid) < (…)`, and a uuid compares as its
 * lowercase text does.
 */
export type ActivityKey = {
  date: CalendarDate;
  recordedAt: Date;
  rank: number;
  id: string;
};

/** Negative when `a` comes before `b` in the feed (it is newer). */
export function compareActivityKeys(a: ActivityKey, b: ActivityKey): number {
  if (a.date !== b.date) return a.date > b.date ? -1 : 1;
  const time = b.recordedAt.getTime() - a.recordedAt.getTime();
  if (time !== 0) return time;
  if (a.rank !== b.rank) return b.rank - a.rank;
  if (a.id === b.id) return 0;
  return a.id > b.id ? -1 : 1;
}

/** True when `key` comes after `cursor` (always, without a cursor). */
export function isAfterCursor(
  key: ActivityKey,
  cursor: ActivityKey | null,
): boolean {
  return cursor == null || compareActivityKeys(key, cursor) > 0;
}

/**
 * The key id of an entry that is one part of a source row, such as one of
 * the Projects an audit event added: a uuid (version 8, RFC 9562) hashed
 * from the row's id and the part, so it is the same on every read and two
 * parts of one row never tie.
 */
export function activityPartId(sourceId: string, part: string): string {
  const hex = createHash("sha256")
    .update(`${sourceId}:${part}`)
    .digest("hex")
    .slice(0, 32);
  const variant = ((parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function encodeActivityCursor(key: ActivityKey): string {
  return Buffer.from(
    JSON.stringify([key.date, key.recordedAt.getTime(), key.rank, key.id]),
    "utf8",
  ).toString("base64url");
}

export function decodeActivityCursor(raw: string): ActivityKey {
  const invalid = () =>
    new DomainError("INVALID_CURSOR", "The page cursor is not valid.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) throw invalid();
  const [date, time, rank, id] = parsed as unknown[];
  if (
    typeof date !== "string" ||
    !isCalendarDate(date) ||
    typeof time !== "number" ||
    !Number.isSafeInteger(time) ||
    typeof rank !== "number" ||
    !Number.isInteger(rank) ||
    typeof id !== "string" ||
    !isUuid(id)
  )
    throw invalid();
  return { date, recordedAt: new Date(time), rank, id };
}

/**
 * Merges sources, each already in feed order, into one page: the first
 * `size` entries, and the key to continue after when there are more.
 */
export function mergeActivity<Entry extends { key: ActivityKey }>(
  sources: readonly (readonly Entry[])[],
  size: number = ACTIVITY_PAGE_SIZE,
): { items: Entry[]; next: ActivityKey | null } {
  const all = sources.flat().sort((a, b) => compareActivityKeys(a.key, b.key));
  const items = all.slice(0, size);
  const last = items.at(-1);
  return {
    items,
    next: all.length > size && last != null ? last.key : null,
  };
}

/** Keeps the entries after the cursor, in feed order, at most `limit`. */
export function pageAfter<Entry extends { key: ActivityKey }>(
  entries: readonly Entry[],
  cursor: ActivityKey | null,
  limit: number,
): Entry[] {
  return entries
    .filter((entry) => isAfterCursor(entry.key, cursor))
    .sort((a, b) => compareActivityKeys(a.key, b.key))
    .slice(0, limit);
}
