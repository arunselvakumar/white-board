import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";

import {
  FOLLOW_UP_ACTIVITIES,
  type FollowUpActivity,
} from "../domain/sales-terms";
import { salesInstant, type DueBounds } from "../domain/sales-time";

/**
 * The Project Dashboard's Inquiry section (CM-1008, ADR CM-0022 §11):
 * Total, Converted, Lost and Conv. Rate by Inquiry Date in the dashboard
 * duration; Open and Overdue now; the funnel (Open inquiries per stage, in
 * stage order); lead source and sales team performance in the duration;
 * Call Activity with its own period. Every figure follows View all as
 * the Inquiries list does.
 */

export const CALL_ACTIVITY_PERIODS = [
  "today",
  "yesterday",
  "this_week",
  "this_month",
  "all_time",
] as const;
export type CallActivityPeriod = (typeof CALL_ACTIVITY_PERIODS)[number];

export const CALL_ACTIVITY_PERIOD_LABELS: Record<CallActivityPeriod, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  this_month: "This Month",
  all_time: "All Time",
};

/** The instants a Call Activity period covers in the Company's zone; null ends are open. */
export function callActivityRange(
  period: CallActivityPeriod,
  today: CalendarDate,
  timeZone: string,
): { from: Date | null; to: Date | null } {
  const start = (date: CalendarDate) => salesInstant(date, null, timeZone);
  const tomorrow = start(addDays(today, 1));
  switch (period) {
    case "today":
      return { from: start(today), to: tomorrow };
    case "yesterday":
      return { from: start(addDays(today, -1)), to: start(today) };
    case "this_week": {
      // Weeks start on Monday.
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      return {
        from: start(addDays(today, -((weekday + 6) % 7))),
        to: tomorrow,
      };
    }
    case "this_month":
      return { from: start(`${today.slice(0, 7)}-01`), to: tomorrow };
    case "all_time":
      return { from: null, to: null };
  }
}

/** Converted ÷ Total × 100 with one decimal; null without inquiries. */
export function conversionRate(
  converted: number,
  total: number,
): number | null {
  if (total === 0) return null;
  return Math.round((converted / total) * 1000) / 10;
}

/** Who the section covers: null with View all, else as the list. */
export type DashboardVisibility = {
  userId: string;
  memberId: string | null;
} | null;

export type InquiryDashboardQuery = {
  workspaceId: string;
  projectId: string;
  visibility: DashboardVisibility;
  /** The dashboard duration, by Inquiry Date (and Done on for follow-ups). */
  range: { from: CalendarDate; to: CalendarDate };
  /** The same duration as instants in the Company's zone. */
  rangeInstants: { from: Date; to: Date };
  bounds: DueBounds;
  calls: { from: Date | null; to: Date | null };
};

export type InquiryDashboardFigures = {
  total: number;
  converted: number;
  lost: number;
  open: number;
  overdue: number;
  funnel: { stageId: string; name: string; count: number }[];
  leadSources: {
    leadSourceId: string | null;
    name: string;
    total: number;
    converted: number;
  }[];
  team: {
    memberId: string | null;
    name: string;
    inquiries: number;
    followUps: number;
    conversions: number;
  }[];
  activities: Record<FollowUpActivity, number>;
};

/** Reads the figures (Prisma in `infrastructure/sales-dashboard-store.ts`). */
export type InquiryDashboardStore = {
  read(query: InquiryDashboardQuery): Promise<InquiryDashboardFigures>;
};

export type InquiryDashboard = Omit<
  InquiryDashboardFigures,
  "leadSources" | "activities"
> & {
  conversionRate: number | null;
  leadSources: (InquiryDashboardFigures["leadSources"][number] & {
    rate: number | null;
  })[];
  callActivity: {
    period: CallActivityPeriod;
    calls: number;
    all: number;
    byActivity: { activity: FollowUpActivity; count: number }[];
  };
};

export function inquiryDashboard(
  figures: InquiryDashboardFigures,
  period: CallActivityPeriod,
): InquiryDashboard {
  const { activities, leadSources, ...rest } = figures;
  return {
    ...rest,
    conversionRate: conversionRate(figures.converted, figures.total),
    leadSources: leadSources.map((source) => ({
      ...source,
      rate: conversionRate(source.converted, source.total),
    })),
    callActivity: {
      period,
      calls: activities.call,
      all: FOLLOW_UP_ACTIVITIES.reduce((sum, key) => sum + activities[key], 0),
      byActivity: FOLLOW_UP_ACTIVITIES.map((activity) => ({
        activity,
        count: activities[activity],
      })),
    },
  };
}
