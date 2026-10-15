import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { childrenByParent, descendantsOf, leavesOf } from "../domain/task";
import {
  baselineDuration,
  baselineVariance,
  dateSpan,
  earnedValue,
  plannedDays,
  projectProgress,
  rollupWeighting,
  taskStatus,
  type ProgressWeighting,
  type RollupLeaf,
  type TaskStatus,
} from "../domain/task-progress";
import type { TaskRow } from "./task-store";

/**
 * A task with what is computed on read (CM-0019 §2–§4): for a summary
 * task the planned dates, baseline and Total Price roll up from its leaf
 * tasks; progress is the cached roll-up; status, durations, variance and
 * earned value follow.
 */
export type TaskView = TaskRow & {
  isSummary: boolean;
  childCount: number;
  descendantCount: number;
  /** Own for a leaf; earliest / latest of the leaves for a summary. */
  plannedStart: CalendarDate | null;
  plannedDue: CalendarDate | null;
  plannedDuration: number | null;
  /** The latest baseline for a leaf; the span of the leaves' for a summary. */
  baselineStartView: CalendarDate | null;
  baselineEndView: CalendarDate | null;
  baselineDurationDays: number | null;
  variance: number | null;
  /** Own for a leaf; Σ of the leaves that have one for a summary. */
  totalPriceView: bigint | null;
  /** Earned value: own for a leaf; Σ of the leaves' for a summary. */
  completedPrice: bigint | null;
  status: TaskStatus;
  /** How a summary weighs its leaves; null for a leaf. */
  weighting: ProgressWeighting | null;
};

function rollupLeaf(row: TaskRow): RollupLeaf {
  return {
    pct: row.pct,
    totalPrice: row.totalPrice,
    startDate: row.startDate,
    dueDate: row.dueDate,
  };
}

/** Views of every task of a Project (pass all its live tasks). */
export function taskViews(
  rows: readonly TaskRow[],
  today: CalendarDate,
): Map<string, TaskView> {
  const children = childrenByParent(rows);
  const views = new Map<string, TaskView>();
  for (const row of rows) {
    const childCount = children.get(row.id)?.length ?? 0;
    const isSummary = childCount > 0;
    const leaves = isSummary ? leavesOf(children, row) : [row];
    const planned = isSummary
      ? dateSpan(
          leaves.map((leaf) => leaf.startDate),
          leaves.map((leaf) => leaf.dueDate),
        )
      : { start: row.startDate, end: row.dueDate };
    const baseline = isSummary
      ? dateSpan(
          leaves.map((leaf) => leaf.baselineStart),
          leaves.map((leaf) => leaf.baselineEnd),
        )
      : { start: row.baselineStart, end: row.baselineEnd };
    const priced = leaves.filter((leaf) => leaf.totalPrice != null);
    const totalPriceView =
      priced.length === 0
        ? null
        : priced.reduce((sum, leaf) => sum + (leaf.totalPrice ?? 0n), 0n);
    const completedPrice =
      priced.length === 0
        ? null
        : priced.reduce(
            (sum, leaf) => sum + (earnedValue(leaf.totalPrice, leaf.pct) ?? 0n),
            0n,
          );
    views.set(row.id, {
      ...row,
      isSummary,
      childCount,
      descendantCount: isSummary ? descendantsOf(children, row.id).length : 0,
      plannedStart: planned.start,
      plannedDue: planned.end,
      plannedDuration: plannedDays(planned.start, planned.end),
      baselineStartView: baseline.start,
      baselineEndView: baseline.end,
      baselineDurationDays: baselineDuration(baseline.start, baseline.end),
      variance:
        baseline.end == null || baseline.start == null
          ? null
          : baselineVariance(
              {
                baselineEnd: baseline.end,
                actualEnd: row.actualEnd,
                dueDate: planned.end,
              },
              today,
            ),
      totalPriceView,
      completedPrice,
      status: taskStatus({ progressPct: row.pct, dueDate: planned.end }, today),
      weighting: isSummary ? rollupWeighting(leaves.map(rollupLeaf)) : null,
    });
  }
  return views;
}

/**
 * The Project's progress over its live leaf tasks (CM-0019 §4), for the
 * dashboard and the Project card (CM-805): pass every live task of the
 * Project.
 */
export function projectProgressOf(rows: readonly TaskRow[]): {
  pct: number | null;
  weighting: ProgressWeighting | null;
} {
  const parents = new Set(rows.flatMap((row) => row.parentId ?? []));
  return projectProgress(
    rows.filter((row) => !parents.has(row.id)).map(rollupLeaf),
  );
}
