import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { DayStatus, LiveState } from "./attendance";

/**
 * How the HRMS Dashboard (CM-319) counts a team's days: the present/absent
 * breakdown for today and the day-wise trend. Pure; the application layer
 * feeds it the day statuses (CM-308) and Team Today's live states.
 */

/** The breakdown's buckets: one per Team Member per day. */
export type DashboardBucket =
  "present" | "half_day" | "absent" | "on_leave" | "holiday" | "week_off";

/** How many Team Members fell in each bucket on one day. */
export type DashboardDayCounts = {
  present: number;
  halfDay: number;
  /** Absent; today, also everyone not checked in yet. */
  absent: number;
  /** Approved leave, a full day or half a day. */
  onLeave: number;
  holiday: number;
  weekOff: number;
};

/** The days the trend covers, today included. */
export const DASHBOARD_TREND_DAYS = 14;

/** The days "upcoming team leaves" look ahead, today included. */
export const DASHBOARD_LEAVE_DAYS = 14;

/** How many of each list the dashboard carries; the full lists are on their own pages. */
export const DASHBOARD_LIST_LIMIT = 5;

/**
 * Where a member's day falls. A holiday, a week off or approved leave
 * keeps its status whatever was worked (the order of the day status,
 * `modules/10` attendance decision 9). Otherwise the hours of closed,
 * approved or approval-free entries decide Present, Half Day or Absent;
 * today only (`live` given), a member checked in right now counts as
 * Present, since their hours are not final until they check out.
 */
export function dashboardBucket(
  status: DayStatus,
  live?: LiveState,
): DashboardBucket {
  switch (status) {
    case "holiday":
    case "week_off":
    case "on_leave":
      return status;
    default:
      return live === "checked_in" ? "present" : status;
  }
}

export function emptyDayCounts(): DashboardDayCounts {
  return {
    present: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    holiday: 0,
    weekOff: 0,
  };
}

const FIELD: Record<DashboardBucket, keyof DashboardDayCounts> = {
  present: "present",
  half_day: "halfDay",
  absent: "absent",
  on_leave: "onLeave",
  holiday: "holiday",
  week_off: "weekOff",
};

/** Counts buckets; every member lands in exactly one. */
export function countBuckets(
  buckets: Iterable<DashboardBucket>,
): DashboardDayCounts {
  const counts = emptyDayCounts();
  for (const bucket of buckets) counts[FIELD[bucket]] += 1;
  return counts;
}

/** A member's days, as the trend reads them. */
export type TrendDay = { date: CalendarDate; status: DayStatus };

/**
 * The day-wise trend: for each date `dates`, how many of the members were
 * in each bucket. `today`'s statuses are refined by `liveToday` (member
 * id → Team Today's state), so a member checked in now counts as present.
 * A member with no day for a date is not counted on it.
 */
export function dayWiseTrend(input: {
  dates: readonly CalendarDate[];
  daysByMember: ReadonlyMap<string, readonly TrendDay[]>;
  today: CalendarDate;
  liveToday: ReadonlyMap<string, LiveState>;
}): (DashboardDayCounts & { date: CalendarDate })[] {
  const byDate = new Map(
    input.dates.map((date) => [date, [] as DashboardBucket[]]),
  );
  for (const [memberId, days] of input.daysByMember)
    for (const day of days) {
      const list = byDate.get(day.date);
      if (list == null) continue;
      list.push(
        dashboardBucket(
          day.status,
          day.date === input.today ? input.liveToday.get(memberId) : undefined,
        ),
      );
    }
  return input.dates.map((date) => ({
    date,
    ...countBuckets(byDate.get(date) ?? []),
  }));
}
