import { Prisma } from "@repo/construction-db";

import {
  assertCalendarDate,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type { IssueStatus } from "../domain/issue";

/**
 * The SQL twin of `issueStatus` (ADR CM-0019 §7): the shown status of a
 * row of `construction_tracking.issues` on the Company's `today`, as
 * `'pending' | 'delayed' | 'solved' | 'closed'` text. `alias` is the table
 * alias in the caller's query (`i` in `FROM construction_tracking.issues i`).
 * Dashboards group by it; `issue-status-sql.http.test.ts` proves it agrees
 * with the TypeScript rule.
 *
 * ```ts
 * prisma.$queryRaw`
 *   SELECT ${issueStatusSql(today)} AS status, count(*)::int AS n
 *   FROM construction_tracking.issues i
 *   WHERE i.workspace_id = ${workspaceId} AND i.deleted_at IS NULL
 *   GROUP BY 1`
 * ```
 */
export function issueStatusSql(today: CalendarDate, alias = "i"): Prisma.Sql {
  const table = Prisma.raw(quoteIdentifier(alias));
  return Prisma.sql`(CASE
    WHEN ${table}.status = 'open'
      AND ${table}.due_date IS NOT NULL
      AND ${table}.due_date < ${assertCalendarDate(today)}::date
      THEN 'delayed'
    WHEN ${table}.status = 'open' THEN 'pending'
    ELSE ${table}.status::text
  END)`;
}

function quoteIdentifier(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias))
    throw new Error(`Not a table alias: ${alias}`);
  return `"${alias}"`;
}

/**
 * The same rule as a Prisma filter on `ConstructionTrackingIssue`, for the
 * list (status chips): one or more shown statuses on `today`.
 */
export function issueStatusWhere(
  statuses: readonly IssueStatus[],
  today: CalendarDate,
): Prisma.ConstructionTrackingIssueWhereInput {
  const day = calendarDateToDb(today);
  const one = (
    status: IssueStatus,
  ): Prisma.ConstructionTrackingIssueWhereInput => {
    switch (status) {
      case "pending":
        return {
          status: "open",
          OR: [{ dueDate: null }, { dueDate: { gte: day } }],
        };
      case "delayed":
        return { status: "open", dueDate: { lt: day } };
      case "solved":
      case "closed":
        return { status };
    }
  };
  return { OR: [...new Set(statuses)].map(one) };
}
