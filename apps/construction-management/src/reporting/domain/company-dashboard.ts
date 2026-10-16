import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";

/**
 * The Company Dashboard (CM-902, ADR CM-0021 §4): one row per Project the
 * member can see, and totals across them. A figure is null on a row when
 * the member may not see it on that Project (no Approve flag on any
 * module, no Read on Issues & Snags, Inspection Request or Attendance, no
 * Payments Read for money). Money is paise as `bigint`.
 */

export const DASHBOARD_PROJECT_STATUSES = [
  "ongoing",
  "not_started",
  "on_hold",
  "completed",
] as const;

export type DashboardProjectStatus =
  (typeof DASHBOARD_PROJECT_STATUSES)[number];

export type DashboardProgress = {
  /** 0–100, two decimals. */
  pct: number;
  weighting: "price" | "duration";
};

export type CompanyDashboardRow = {
  id: string;
  name: string;
  status: DashboardProjectStatus;
  /** Project Progress % from Tasks; null when the Project has no tasks. */
  progress: DashboardProgress | null;
  /** Pending documents the member may decide on the Project. */
  approvals: number | null;
  /** Open Issues & Snags in the duration, delayed included. */
  pendingIssues: number | null;
  /** The delayed part of `pendingIssues`. */
  delayedIssues: number | null;
  /** Inspection Requests pending a decision in the duration. */
  pendingInspections: number | null;
  /** Labours present or on half day on the Company's today. */
  labourToday: number | null;
  /** Σ due on bills from parties on the Project, on the Company's today. */
  due: bigint | null;
};

export type CompanyDashboardTotals = {
  /** Visible Projects whose status is Ongoing. */
  activeProjects: number;
  approvals: number | null;
  pendingIssues: number | null;
  pendingInspections: number | null;
  labourToday: number | null;
  amountDue: bigint | null;
};

function present<T>(values: readonly (T | null)[]): T[] | null {
  const shown = values.filter((value): value is T => value != null);
  return shown.length === 0 ? null : shown;
}

function count(values: readonly (number | null)[]): number | null {
  return present(values)?.reduce((sum, value) => sum + value, 0) ?? null;
}

function money(values: readonly (bigint | null)[]): bigint | null {
  return present(values)?.reduce((sum, value) => sum + value, 0n) ?? null;
}

/**
 * Totals across the rows: each figure sums the Projects where the member
 * sees it, and is null when they see it on none.
 */
export function companyDashboardTotals(
  rows: readonly CompanyDashboardRow[],
): CompanyDashboardTotals {
  return {
    activeProjects: rows.filter((row) => row.status === "ongoing").length,
    approvals: count(rows.map((row) => row.approvals)),
    pendingIssues: count(rows.map((row) => row.pendingIssues)),
    pendingInspections: count(rows.map((row) => row.pendingInspections)),
    labourToday: count(rows.map((row) => row.labourToday)),
    amountDue: money(rows.map((row) => row.due)),
  };
}

const byName = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** The Projects home order: by status (Ongoing first), then by name. */
export function compareDashboardProjects(
  a: { status: DashboardProjectStatus; name: string },
  b: { status: DashboardProjectStatus; name: string },
): number {
  const byStatus =
    DASHBOARD_PROJECT_STATUSES.indexOf(a.status) -
    DASHBOARD_PROJECT_STATUSES.indexOf(b.status);
  return byStatus !== 0 ? byStatus : byName.compare(a.name, b.name);
}

/** `YYYY-MM-DD` arithmetic on the calendar month, clamped to its last day. */
function monthsBefore(date: CalendarDate, months: number): CalendarDate {
  const [year = 0, month = 1, dayOfMonth = 1] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(dayOfMonth, last));
  return target.toISOString().slice(0, 10);
}

/**
 * The dashboards' default duration (ADR CM-0021 §4): the last 12 months
 * ending `today`, the day after the same date a year ago through today —
 * the duration filter's "Last 12 months".
 */
export function lastTwelveMonths(today: CalendarDate): {
  from: CalendarDate;
  to: CalendarDate;
} {
  return { from: addDays(monthsBefore(today, 12), 1), to: today };
}
