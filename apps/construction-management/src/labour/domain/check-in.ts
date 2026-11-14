import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  haversineMetres,
  isLatitude,
  isLongitude,
} from "@/src/shared-kernel/geo";
import { zoneParts } from "@/src/shared-kernel/zone-time";

import {
  DEFAULT_BREAK_MINUTES,
  MAX_BREAK_MINUTES,
  type AttendanceStatus,
} from "./wages";

/**
 * Check-In on a Project (ADR CM-0043): the rules of a check-in entry, kept
 * free of storage so they can be tested as plain functions.
 */

export const CHECK_IN_PERSON_KINDS = [
  "labour",
  "vendor",
  "site_engineer",
] as const;

/** `site_engineer` is a Site Engineer row, not their sign-in. */
export type CheckInPersonKind = (typeof CHECK_IN_PERSON_KINDS)[number];

export const CHECK_IN_ACTIONS = ["check_in", "check_out"] as const;

export type CheckInAction = (typeof CHECK_IN_ACTIONS)[number];

/** A Check In older than this no longer counts as open (ADR CM-0043 §2). */
export const OPEN_CHECK_IN_HOURS = 16;

/** The same action again inside this window writes nothing. */
export const REPEAT_WINDOW_SECONDS = 120;

/** A check-in photo is a JPEG, PNG or WebP of at most 1 MB. */
export const CHECK_IN_PHOTO_MAX_BYTES = 1024 * 1024;

/** Photos are removed this many days after the entry. */
export const CHECK_IN_PHOTO_RETENTION_DAYS = 90;

export const VOID_REASON_MAX = 200;

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** What the rules need to know about an entry that is not voided. */
export type LiveEntry = {
  id: string;
  action: CheckInAction;
  /** The server's clock when the entry arrived. */
  occurredAt: Date;
  attendanceDate: CalendarDate;
};

/** Where a person stands now, from their last live entry on the Project. */
export type PersonState =
  | { status: "in"; since: Date; attendanceDate: CalendarDate }
  | { status: "out"; since: Date }
  | { status: "none" };

/** The last entry when it is a Check In still counted as open. */
function openEntry(last: LiveEntry | null, now: Date): LiveEntry | null {
  if (last?.action !== "check_in") return null;
  const age = now.getTime() - last.occurredAt.getTime();
  return age < OPEN_CHECK_IN_HOURS * HOUR_MS ? last : null;
}

/**
 * In while the last live entry is a Check In younger than
 * `OPEN_CHECK_IN_HOURS`; out when it is a Check Out of today's attendance
 * day; otherwise nothing yet (a Check In left open too long reads as none).
 */
export function personState(
  last: LiveEntry | null,
  now: Date,
  today: CalendarDate,
): PersonState {
  const open = openEntry(last, now);
  if (open != null)
    return {
      status: "in",
      since: open.occurredAt,
      attendanceDate: open.attendanceDate,
    };
  if (last?.action === "check_out" && last.attendanceDate === today)
    return { status: "out", since: last.occurredAt };
  return { status: "none" };
}

/** The action the screen offers first: the opposite of where they stand. */
export function defaultAction(state: PersonState): CheckInAction {
  return state.status === "in" ? "check_out" : "check_in";
}

export type EntryDecision =
  /** Write the entry on this attendance day. */
  | { kind: "record"; attendanceDate: CalendarDate }
  /** The same action was just recorded: answer with that entry. */
  | { kind: "repeat"; entryId: string; attendanceDate: CalendarDate };

/**
 * Whether a new entry may be written after the person's last live one
 * (ADR CM-0043 §2). A Check In belongs to today; a Check Out to the day of
 * the Check In it closes, so a night shift stays on the day it began.
 */
export function decideEntry(input: {
  action: CheckInAction;
  last: LiveEntry | null;
  now: Date;
  /** Today in the Company's time zone. */
  today: CalendarDate;
}): EntryDecision {
  const { action, last, now } = input;
  if (
    last?.action === action &&
    now.getTime() - last.occurredAt.getTime() < REPEAT_WINDOW_SECONDS * 1000
  )
    return {
      kind: "repeat",
      entryId: last.id,
      attendanceDate: last.attendanceDate,
    };
  const open = openEntry(last, now);
  if (action === "check_in") {
    if (open != null)
      throw new DomainError(
        "ALREADY_CHECKED_IN",
        "They are already checked in. Check them out first.",
        {
          kind: "conflict",
          details: { since: open.occurredAt.toISOString() },
        },
      );
    return { kind: "record", attendanceDate: input.today };
  }
  if (open == null)
    throw new DomainError(
      "NOT_CHECKED_IN",
      "They are not checked in. Check them in first.",
      { kind: "conflict" },
    );
  return { kind: "record", attendanceDate: open.attendanceDate };
}

/** `HH:MM` on the Company's wall clock. */
export function clockTime(instant: Date, timeZone: string): string {
  const { hour, minute } = zoneParts(instant, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** In, Out and break of a Labour's day as the entries give them. */
export type EntryTimes = {
  checkIn: string;
  /** Null while the Labour is in, or when In to Out cannot be told in a day. */
  checkOut: string | null;
  /** Whole minutes, 0 to 720, shorter than In to Out. */
  breakMinutes: number;
};

/**
 * A Labour's In, Out and break from the live entries of one attendance day,
 * oldest first (ADR CM-0043 §3). In is the first Check In; Out is the last
 * Check Out when the Labour is out; the break is the gaps between a Check
 * Out and the next Check In. With no gap it is the default break when the
 * day is longer than it, and none otherwise. Null when the day has no
 * Check In.
 *
 * Entries that cannot follow each other (a second Check In after a void
 * removed the Check Out between) are skipped, so a void never produces a
 * negative gap.
 */
export function timesFromEntries(
  entries: readonly Pick<LiveEntry, "action" | "occurredAt">[],
  timeZone: string,
): EntryTimes | null {
  const minuteOf = (entry: { occurredAt: Date }) =>
    Math.floor(entry.occurredAt.getTime() / MINUTE_MS);
  let first: Date | null = null;
  let lastOut: Date | null = null;
  let isIn = false;
  let gapMinutes = 0;
  let gaps = 0;
  for (const entry of entries) {
    if (entry.action === "check_in") {
      if (isIn) continue;
      if (first == null) first = entry.occurredAt;
      else if (lastOut != null) {
        gapMinutes += minuteOf(entry) - minuteOf({ occurredAt: lastOut });
        gaps += 1;
      }
      isIn = true;
    } else {
      if (!isIn) continue;
      lastOut = entry.occurredAt;
      isIn = false;
    }
  }
  if (first == null) return null;
  const checkIn = clockTime(first, timeZone);
  const recorded = Math.min(gapMinutes, MAX_BREAK_MINUTES);
  if (isIn || lastOut == null)
    return {
      checkIn,
      checkOut: null,
      breakMinutes: gaps > 0 ? recorded : DEFAULT_BREAK_MINUTES,
    };
  const span =
    minuteOf({ occurredAt: lastOut }) - minuteOf({ occurredAt: first });
  // A day's times are clock times, so In to Out must be more than nothing
  // and less than a day; otherwise the Out is left for the sheet.
  if (span < 1 || span >= 24 * 60)
    return {
      checkIn,
      checkOut: null,
      breakMinutes: gaps > 0 ? recorded : DEFAULT_BREAK_MINUTES,
    };
  const checkOut = clockTime(lastOut, timeZone);
  // A clock set back an hour can show the In's time again an hour later;
  // a day cannot hold an Out equal to its In, so it is left for the sheet.
  if (checkOut === checkIn)
    return {
      checkIn,
      checkOut: null,
      breakMinutes: gaps > 0 ? recorded : DEFAULT_BREAK_MINUTES,
    };
  const wanted =
    gaps > 0
      ? recorded
      : span > DEFAULT_BREAK_MINUTES
        ? DEFAULT_BREAK_MINUTES
        : 0;
  return {
    checkIn,
    checkOut,
    breakMinutes: Math.max(0, Math.min(wanted, span - 1)),
  };
}

/** What the rules need to know about the Labour's day as it is stored. */
export type DayBefore = {
  status: AttendanceStatus;
  /** `HH:MM`, or null when the day has no times. */
  checkIn: string | null;
  fromCheckIn: boolean;
  timesFromCheckIn: boolean;
};

/** Why an entry left the Labour's day as it was. */
export type DayKeptReason =
  /** The sheet's typed times win over the log. */
  | "sheet_times"
  /** The day is marked Absent, On Leave or Holiday. */
  | "status"
  /** Nothing to do (a Check Out or a void with no day to change). */
  | "no_day";

export type DayEffect =
  /** Mark the day Present with these times. */
  | { kind: "create"; times: EntryTimes }
  /** Replace the day's times; null removes them. */
  | { kind: "set_times"; times: EntryTimes | null }
  /** Tombstone the day and reverse its ledger entries. */
  | { kind: "clear" }
  | { kind: "keep"; reason: DayKeptReason };

/**
 * What a Labour's entries do to their attendance day (ADR CM-0043 §3).
 * `times` is `timesFromEntries` of the live entries left, null when none
 * are. Only a Check In may create the day: a void or a Check Out never
 * brings back a day the sheet cleared.
 */
export function dayEffect(input: {
  day: DayBefore | null;
  times: EntryTimes | null;
  cause: CheckInAction | "void";
}): DayEffect {
  const { day, times } = input;
  if (day == null)
    return times != null && input.cause === "check_in"
      ? { kind: "create", times }
      : { kind: "keep", reason: "no_day" };
  if (times == null) {
    if (day.fromCheckIn) return { kind: "clear" };
    if (day.timesFromCheckIn) return { kind: "set_times", times: null };
    return { kind: "keep", reason: "no_day" };
  }
  if (day.status !== "present" && day.status !== "half_day")
    return { kind: "keep", reason: "status" };
  if (day.checkIn != null && !day.timesFromCheckIn)
    return { kind: "keep", reason: "sheet_times" };
  return { kind: "set_times", times };
}

const STATUS_WORDS: Record<AttendanceStatus, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
  on_leave: "On Leave",
  holiday: "Holiday",
};

/** The line the operator reads when an entry left the day alone. */
export function dayKeptNote(
  reason: DayKeptReason,
  status: AttendanceStatus | null,
): string | null {
  if (reason === "sheet_times")
    return "The times typed on the attendance sheet were kept.";
  if (reason === "status" && status != null)
    return `Marked ${STATUS_WORDS[status]} on the attendance sheet. Change it there if that is wrong.`;
  return null;
}

/**
 * Whether a day saved from the marking sheet still follows the log: only
 * when it did before and the sheet sent back the same In, Out and break.
 */
export function sheetKeepsLogTimes(
  before: {
    timesFromCheckIn: boolean;
    checkIn: string | null;
    checkOut: string | null;
    breakMinutes: number | null;
  } | null,
  after: {
    checkIn: string | null;
    checkOut: string | null;
    breakMinutes: number | null;
  },
): boolean {
  return (
    before != null &&
    before.timesFromCheckIn &&
    after.checkIn != null &&
    before.checkIn === after.checkIn &&
    before.checkOut === after.checkOut &&
    before.breakMinutes === after.breakMinutes
  );
}

/** A Project's Site fence: a point and a radius. */
export type SiteFence = {
  name: string;
  latitude: number;
  longitude: number;
  radiusMetres: number;
};

/** The device's location as the browser reported it. */
export type DeviceFix = {
  latitude: number;
  longitude: number;
  /** Metres; null when the device did not say. */
  accuracyMetres: number | null;
};

/** The reported accuracy counts toward a fence for at most this much. */
export const MAX_ACCURACY_ALLOWANCE_METRES = 50;

/**
 * The location sent with an entry: null when none was sent (never an
 * error), and refused when half of it or nonsense was.
 */
export function readDeviceFix(input: {
  latitude?: number | null;
  longitude?: number | null;
  accuracyMetres?: number | null;
}): DeviceFix | null {
  const { latitude, longitude } = input;
  if (latitude == null && longitude == null) return null;
  if (
    latitude == null ||
    longitude == null ||
    !isLatitude(latitude) ||
    !isLongitude(longitude)
  )
    throw new DomainError(
      "LOCATION_INVALID",
      "The location sent with this entry is not a place on the map.",
      { details: { field: "location" } },
    );
  const accuracy = input.accuracyMetres;
  return {
    latitude,
    longitude,
    accuracyMetres:
      accuracy == null || !Number.isFinite(accuracy) || accuracy < 0
        ? null
        : Math.min(accuracy, 999_999.99),
  };
}

/**
 * Compares a location with the Project's Site fence, by the rule HRMS uses
 * for its own check-in: inside when the distance to the centre is at most
 * the radius plus the reported accuracy, capped. Null without a location
 * or a fence. An entry outside is flagged, never refused (ADR CM-0043 §5).
 */
export function compareWithFence(
  fence: SiteFence | null,
  fix: DeviceFix | null,
): { outsideFence: boolean; metresOutside: number } | null {
  if (fence == null || fix == null) return null;
  const allowance = Math.min(
    fix.accuracyMetres ?? 0,
    MAX_ACCURACY_ALLOWANCE_METRES,
  );
  const beyond =
    haversineMetres(
      { latitude: fence.latitude, longitude: fence.longitude },
      fix,
    ) - fence.radiusMetres;
  if (beyond <= allowance) return { outsideFence: false, metresOutside: 0 };
  return { outsideFence: true, metresOutside: Math.max(1, Math.round(beyond)) };
}

/** A void needs a reason a person can read later. */
export function voidReason(raw: string): string {
  const reason = raw.trim();
  if (reason.length === 0 || reason.length > VOID_REASON_MAX)
    throw new DomainError(
      "VOID_REASON_REQUIRED",
      `Say why this entry is wrong, in at most ${String(VOID_REASON_MAX)} characters.`,
      { details: { field: "reason" } },
    );
  return reason;
}
