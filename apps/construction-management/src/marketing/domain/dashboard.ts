import {
  addDays,
  daysBetween,
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import { invalidField } from "./marketing-errors";
import { monthBounds, monthOf } from "./team";

/** The Dashboard's period switch (PRD §3.7). */
export const DASHBOARD_PERIODS = [
  "this_week",
  "this_month",
  "last_month",
  "custom",
] as const;
export type DashboardPeriodKind = (typeof DASHBOARD_PERIODS)[number];

/** The longest custom period, in days (a year, leap day included). */
export const DASHBOARD_MAX_DAYS = 366;

/** A custom period this long or shorter is shown day by day. */
export const DASHBOARD_DAY_BUCKET_MAX_DAYS = 14;

/** Both days inclusive, in the Company's calendar. */
export type DashboardPeriod = {
  kind: DashboardPeriodKind;
  from: CalendarDate;
  to: CalendarDate;
};

export type DashboardBucket = "day" | "week";

function periodInvalid(message: string, field: string) {
  return invalidField("DASHBOARD_PERIOD_INVALID", message, field);
}

/** 0 for Monday … 6 for Sunday. */
function weekdayFromMonday(date: CalendarDate): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The Monday on or before the date: weeks start on Monday (ADR CM-0040 §13). */
export function mondayOf(date: CalendarDate): CalendarDate {
  return addDays(date, -weekdayFromMonday(date));
}

/**
 * The days a period covers from the Company's today: this week is Monday
 * to Sunday, a month is its first to its last day, and a custom period
 * needs both days, the first on or before the last, at most a year.
 */
export function dashboardPeriod(
  input: { kind: DashboardPeriodKind; from?: string; to?: string },
  today: CalendarDate,
): DashboardPeriod {
  switch (input.kind) {
    case "this_week": {
      const from = mondayOf(today);
      return { kind: input.kind, from, to: addDays(from, 6) };
    }
    case "this_month": {
      const { first, next } = monthBounds(monthOf(today));
      return { kind: input.kind, from: first, to: addDays(next, -1) };
    }
    case "last_month": {
      const { first } = monthBounds(monthOf(today));
      const previous = monthBounds(monthOf(addDays(first, -1)));
      return {
        kind: input.kind,
        from: previous.first,
        to: addDays(first, -1),
      };
    }
    case "custom": {
      const { from, to } = input;
      if (from == null || !isCalendarDate(from))
        throw periodInvalid("Choose the first day.", "from");
      if (to == null || !isCalendarDate(to))
        throw periodInvalid("Choose the last day.", "to");
      if (from > to)
        throw periodInvalid(
          "Choose a first day on or before the last day.",
          "from",
        );
      if (daysBetween(from, to) + 1 > DASHBOARD_MAX_DAYS)
        throw periodInvalid("Choose at most a year.", "to");
      return { kind: input.kind, from, to };
    }
  }
}

/** Day by day for a week or a short custom period; week by week otherwise. */
export function dashboardBucket(period: DashboardPeriod): DashboardBucket {
  if (period.kind === "this_week") return "day";
  if (
    period.kind === "custom" &&
    daysBetween(period.from, period.to) + 1 <= DASHBOARD_DAY_BUCKET_MAX_DAYS
  )
    return "day";
  return "week";
}

/** The bucket a day falls in: the day itself, or its week's Monday. */
export function bucketStartOf(
  date: CalendarDate,
  bucket: DashboardBucket,
): CalendarDate {
  return bucket === "day" ? date : mondayOf(date);
}

/**
 * Every bucket of the period, oldest first. A week bucket starts on its
 * Monday, which can fall before the period's first day.
 */
export function bucketStarts(
  period: DashboardPeriod,
  bucket: DashboardBucket,
): CalendarDate[] {
  const step = bucket === "day" ? 1 : 7;
  const starts: CalendarDate[] = [];
  for (
    let start = bucketStartOf(period.from, bucket);
    start <= period.to;
    start = addDays(start, step)
  )
    starts.push(start);
  return starts;
}

/** The month whose Visit target a period is measured against, if any. */
export function targetMonthOf(period: DashboardPeriod): string | null {
  return period.kind === "this_month" || period.kind === "last_month"
    ? monthOf(period.from)
    : null;
}

/**
 * Whose records the figures are over (ADR CM-0040 §13): the member's own
 * (§5) without View all on the Dashboard; with it, the team's, or one
 * Marketing Person's (Visits they went on, Follow-ups they own, companies
 * assigned to them).
 */
export type DashboardScope =
  | { kind: "own"; userId: string; memberId: string | null }
  | { kind: "team" }
  | { kind: "person"; memberId: string };

/** A Visits figure needs Visits read, and so on for each section. */
export type DashboardSections = {
  visits: boolean;
  followUps: boolean;
  companies: boolean;
};

/** Recent activity's line for a Visit note: its first 140 characters. */
export const RECENT_NOTE_LENGTH = 140;

export function shortNote(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= RECENT_NOTE_LENGTH
    ? line
    : `${line.slice(0, RECENT_NOTE_LENGTH - 1).trimEnd()}…`;
}
