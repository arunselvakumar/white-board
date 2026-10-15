import { Prisma } from "@repo/construction-db";

import { isInspectionStatus } from "../domain/inspection";
import { isIssueStatus } from "../domain/issue";
import { isTrackingPriority } from "../domain/tracking-documents";
import type { TrackingDashboardStore } from "../application/tracking-dashboard";
import { issueStatusSql } from "./issue-status-sql";

/**
 * The dashboard's counts in Postgres (CM-805). Issues are grouped by the
 * shown status from `issueStatusSql`, so Delayed is the same rule the list
 * uses.
 */
export const prismaTrackingDashboardStore: TrackingDashboardStore = {
  async issueGroups(db, query) {
    const own =
      query.own == null
        ? Prisma.empty
        : query.own.memberId == null
          ? Prisma.sql`AND i.created_by = ${query.own.userId}`
          : Prisma.sql`AND (i.created_by = ${query.own.userId}
              OR i.assignee_member_id = ${query.own.memberId}::uuid)`;
    const rows = await db.$queryRaw<
      {
        status: string;
        priority: string | null;
        categoryId: string | null;
        assigneeMemberId: string | null;
        count: number;
      }[]
    >(Prisma.sql`
      SELECT ${issueStatusSql(query.today, "i")} AS status,
             i.priority::text AS priority,
             i.category_id::text AS "categoryId",
             i.assignee_member_id::text AS "assigneeMemberId",
             count(*)::int AS count
      FROM construction_tracking.issues i
      WHERE i.workspace_id = ${query.workspaceId}
        AND i.project_id = ${query.projectId}::uuid
        AND i.deleted_at IS NULL
        AND i.issue_date BETWEEN ${query.range.from}::date
                             AND ${query.range.to}::date
        ${own}
      GROUP BY 1, 2, 3, 4
    `);
    return rows.flatMap((row) =>
      isIssueStatus(row.status)
        ? [
            {
              status: row.status,
              priority:
                row.priority != null && isTrackingPriority(row.priority)
                  ? row.priority
                  : null,
              categoryId: row.categoryId,
              assigneeMemberId: row.assigneeMemberId,
              count: row.count,
            },
          ]
        : [],
    );
  },

  async inspectionCounts(db, query) {
    const rows = await db.$queryRaw<{ status: string; count: number }[]>(
      Prisma.sql`
        SELECT r.status::text AS status, count(*)::int AS count
        FROM construction_tracking.inspections r
        WHERE r.workspace_id = ${query.workspaceId}
          AND r.project_id = ${query.projectId}::uuid
          AND r.deleted_at IS NULL
          AND r.inspection_date BETWEEN ${query.range.from}::date
                                    AND ${query.range.to}::date
        GROUP BY 1
      `,
    );
    const counts = new Map<"pending" | "approved" | "rejected", number>();
    for (const row of rows)
      if (isInspectionStatus(row.status)) counts.set(row.status, row.count);
    return counts;
  },
};
