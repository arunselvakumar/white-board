import {
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type { InspectionStatus } from "./inspection";
import { successRate } from "./inspection";
import type { IssueStatus } from "./issue";
import { TASK_STATUSES, type TaskStatus } from "./task-progress";
import type { TrackingPriority } from "./tracking-documents";

/**
 * The Project Dashboard's Task, Issue & Snag and Inspection Request
 * sections (CM-805, ADR CM-0019 §14), as pure arithmetic over rows the
 * application has already scoped to the duration and the viewer.
 */

/** How many delayed tasks the Task section lists. */
export const MOST_DELAYED_LIMIT = 5;

/** How many tasks Value Earned By Task draws; the rest are counted. */
export const VALUE_EARNED_LIMIT = 10;

/** Days a task is late on `today`: today − Due Date (0 when not past due). */
export function daysLate(
  due: CalendarDate | null,
  today: CalendarDate,
): number {
  if (due == null || due >= today) return 0;
  return daysBetween(due, today);
}

/** A count per task status, every status present. */
export function countByStatus(
  statuses: readonly TaskStatus[],
): Record<TaskStatus, number> {
  const counts = Object.fromEntries(
    TASK_STATUSES.map((status) => [status, 0]),
  ) as Record<TaskStatus, number>;
  for (const status of statuses) counts[status] += 1;
  return counts;
}

/** A task as the "most delayed" list reads it. */
export type DelayedCandidate = {
  id: string;
  taskNo: number;
  status: TaskStatus;
  isSummary: boolean;
  dueDate: CalendarDate | null;
};

/**
 * The most delayed **leaf** tasks (a summary's delay is its late leaves'),
 * most days late first, then by Task No.
 */
export function mostDelayed<T extends DelayedCandidate>(
  tasks: readonly T[],
  today: CalendarDate,
  limit = MOST_DELAYED_LIMIT,
): (T & { daysLate: number })[] {
  return tasks
    .filter((task) => !task.isSummary && task.status === "delayed")
    .map((task) => ({ ...task, daysLate: daysLate(task.dueDate, today) }))
    .sort((a, b) => b.daysLate - a.daysLate || a.taskNo - b.taskNo)
    .slice(0, limit);
}

/** A task with its value as Value Earned By Task reads it. */
export type ValuedTask = {
  id: string;
  parentId: string | null;
  taskNo: number;
  /** Total Price (rolled up for a summary); null without any price. */
  value: bigint | null;
  /** Completed Price (earned value); null without any price. */
  earned: bigint | null;
};

/**
 * Value Earned By Task: the tasks counted none of whose ancestors are
 * counted (with View all and every task in the period, the top-level
 * tasks), with a price; the `limit` largest by value, the rest counted in
 * `more`, and the totals over all of them in paise.
 */
export function valueEarnedByTask<T extends ValuedTask>(
  counted: readonly T[],
  parentOf: (id: string) => string | null,
  limit = VALUE_EARNED_LIMIT,
): {
  tasks: T[];
  more: number;
  totals: { value: bigint; earned: bigint };
} {
  const ids = new Set(counted.map((task) => task.id));
  const topMost = counted.filter((task) => {
    for (let up = task.parentId; up != null; up = parentOf(up))
      if (ids.has(up)) return false;
    return true;
  });
  const priced = topMost.filter((task) => task.value != null);
  priced.sort((a, b) => {
    const diff = (b.value ?? 0n) - (a.value ?? 0n);
    return diff > 0n ? 1 : diff < 0n ? -1 : a.taskNo - b.taskNo;
  });
  return {
    tasks: priced.slice(0, limit),
    more: Math.max(0, priced.length - limit),
    totals: {
      value: priced.reduce((sum, task) => sum + (task.value ?? 0n), 0n),
      earned: priced.reduce((sum, task) => sum + (task.earned ?? 0n), 0n),
    },
  };
}

// ---------------------------------------------------------------------------
// Issues & Snags
// ---------------------------------------------------------------------------

/** One group of issues as the store counts them. */
export type IssueGroup = {
  status: IssueStatus;
  priority: TrackingPriority | null;
  categoryId: string | null;
  assigneeMemberId: string | null;
  count: number;
};

export type IssueStatusCounts = Record<IssueStatus, number>;

const emptyStatusCounts = (): IssueStatusCounts => ({
  pending: 0,
  delayed: 0,
  solved: 0,
  closed: 0,
});

export type IssueSummary = {
  total: number;
  byStatus: IssueStatusCounts;
  byPriority: Record<TrackingPriority | "none", number>;
  /** Most issues first, then by name; `null` is "No category". */
  byCategory: {
    categoryId: string | null;
    name: string | null;
    count: number;
  }[];
  /** Most issues first, then by name; `null` is "Not assigned". */
  byAssignee: ({
    memberId: string | null;
    name: string | null;
    total: number;
  } & IssueStatusCounts)[];
};

/** Sorts named counts: most first, then by name, the unnamed (null id) last. */
function byCountThenName<
  T extends { id: string | null; name: string | null; count: number },
>(a: T, b: T): number {
  if ((a.id == null) !== (b.id == null)) return a.id == null ? 1 : -1;
  return b.count - a.count || (a.name ?? "").localeCompare(b.name ?? "");
}

/**
 * The Issue & Snag section from counted groups: by shown status (Pending,
 * Delayed, Solved, Closed), by priority, by category and assignee-wise by
 * status. `names` give category and Team Member names.
 */
export function summariseIssues(
  groups: readonly IssueGroup[],
  names: {
    categories: ReadonlyMap<string, string>;
    members: ReadonlyMap<string, string>;
  },
): IssueSummary {
  const byStatus = emptyStatusCounts();
  const byPriority = { high: 0, medium: 0, low: 0, none: 0 };
  const categories = new Map<string | null, number>();
  const assignees = new Map<string | null, IssueStatusCounts>();
  let total = 0;
  for (const group of groups) {
    total += group.count;
    byStatus[group.status] += group.count;
    byPriority[group.priority ?? "none"] += group.count;
    categories.set(
      group.categoryId,
      (categories.get(group.categoryId) ?? 0) + group.count,
    );
    const counts = assignees.get(group.assigneeMemberId) ?? emptyStatusCounts();
    counts[group.status] += group.count;
    assignees.set(group.assigneeMemberId, counts);
  }
  return {
    total,
    byStatus,
    byPriority,
    byCategory: [...categories]
      .map(([id, count]) => ({
        id,
        name: id == null ? null : (names.categories.get(id) ?? null),
        count,
      }))
      .sort(byCountThenName)
      .map(({ id, name, count }) => ({ categoryId: id, name, count })),
    byAssignee: [...assignees]
      .map(([id, counts]) => ({
        id,
        name: id == null ? null : (names.members.get(id) ?? null),
        count: counts.pending + counts.delayed + counts.solved + counts.closed,
        counts,
      }))
      .sort(byCountThenName)
      .map(({ id, name, count, counts }) => ({
        memberId: id,
        name,
        total: count,
        ...counts,
      })),
  };
}

/** Pending Issues & Snags (the KPI): open ones, delayed included. */
export function pendingIssues(byStatus: IssueStatusCounts): number {
  return byStatus.pending + byStatus.delayed;
}

// ---------------------------------------------------------------------------
// Inspection Requests
// ---------------------------------------------------------------------------

export type InspectionSummary = {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  /** Approved ÷ (Approved + Rejected) × 100; null with no decided request. */
  successRate: number | null;
};

/** The Inspection Request section from counts by status. */
export function summariseInspections(
  counts: ReadonlyMap<InspectionStatus, number>,
): InspectionSummary {
  const approved = counts.get("approved") ?? 0;
  const pending = counts.get("pending") ?? 0;
  const rejected = counts.get("rejected") ?? 0;
  return {
    total: approved + pending + rejected,
    approved,
    pending,
    rejected,
    successRate: successRate(approved, rejected),
  };
}
