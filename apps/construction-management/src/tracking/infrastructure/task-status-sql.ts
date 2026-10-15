import { Prisma } from "@repo/construction-db";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

/**
 * The SQL twin of `taskStatus` (ADR CM-0019 §3): list filters and the
 * dashboard compute a task's status in Postgres from the same rule, so it
 * is never stored. `task-status-sql.http.test.ts` proves they agree.
 *
 * A summary task's Due Date is the latest of its live leaf tasks'; its
 * `progress_pct` is the cached roll-up the recompute writes.
 */

const ALIAS = /^[a-z_][a-z0-9_]*$/;

function alias(name: string): Prisma.Sql {
  if (!ALIAS.test(name)) throw new RangeError(`Not a SQL alias: ${name}`);
  return Prisma.raw(name);
}

/** True when the task has live sub-tasks. */
export function taskIsSummarySql(taskAlias: string): Prisma.Sql {
  const t = alias(taskAlias);
  return Prisma.sql`EXISTS (
    SELECT 1 FROM construction_tracking.tasks sub_c
    WHERE sub_c.parent_id = ${t}.id AND sub_c.deleted_at IS NULL)`;
}

/** The live leaf tasks under a summary task (children and grandchildren). */
function leafFilter(t: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`leaf.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM construction_tracking.tasks leaf_c
      WHERE leaf_c.parent_id = leaf.id AND leaf_c.deleted_at IS NULL)
    AND (leaf.parent_id = ${t}.id OR leaf.parent_id IN (
      SELECT mid.id FROM construction_tracking.tasks mid
      WHERE mid.parent_id = ${t}.id AND mid.deleted_at IS NULL))`;
}

/** The task's Due Date: its own, or the latest of its leaf tasks'. */
export function taskDueSql(taskAlias: string): Prisma.Sql {
  const t = alias(taskAlias);
  return Prisma.sql`(CASE WHEN ${taskIsSummarySql(taskAlias)}
    THEN (SELECT max(leaf.due_date) FROM construction_tracking.tasks leaf
          WHERE ${leafFilter(t)})
    ELSE ${t}.due_date END)`;
}

/** The task's Start Date: its own, or the earliest of its leaf tasks'. */
export function taskStartSql(taskAlias: string): Prisma.Sql {
  const t = alias(taskAlias);
  return Prisma.sql`(CASE WHEN ${taskIsSummarySql(taskAlias)}
    THEN (SELECT min(leaf.start_date) FROM construction_tracking.tasks leaf
          WHERE ${leafFilter(t)})
    ELSE ${t}.start_date END)`;
}

/**
 * The task's status as text (`not_started`, `in_progress`, `delayed`,
 * `completed`) for a row of `construction_tracking.tasks` aliased
 * `taskAlias`, with `today` the Company's today.
 */
export function taskStatusSql(
  taskAlias: string,
  today: CalendarDate,
): Prisma.Sql {
  const t = alias(taskAlias);
  const due = taskDueSql(taskAlias);
  return Prisma.sql`(CASE
    WHEN ${t}.progress_pct >= 100 THEN 'completed'
    WHEN ${due} IS NOT NULL AND ${due} < ${today}::date THEN 'delayed'
    WHEN ${t}.progress_pct > 0 THEN 'in_progress'
    ELSE 'not_started' END)`;
}
