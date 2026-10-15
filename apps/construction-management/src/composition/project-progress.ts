import { Prisma, prisma, type PrismaClient } from "@repo/construction-db";

import type {
  ProjectProgress,
  ProjectProgressReader,
} from "@/src/projects/application/project-progress";
import {
  calendarDateFromDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  percentFromDb,
  projectProgress,
  type RollupLeaf,
} from "@/src/tracking/domain/task-progress";

type LeafRow = {
  projectId: string;
  progressPct: Prisma.Decimal;
  totalPrice: bigint | null;
  startDate: Date | null;
  dueDate: Date | null;
};

const day = (value: Date | null): CalendarDate | null =>
  value == null ? null : calendarDateFromDb(value);

/**
 * The projects context's `ProjectProgressReader` over the tracking tables
 * (CM-805): every live leaf task of each Project, rolled up with the
 * tracking rule (`projectProgress`, CM-0019 §4) — the same number as the
 * dashboard's Project Progress %.
 */
export function trackingProjectProgress(
  db: PrismaClient = prisma,
): ProjectProgressReader {
  return {
    async progressOf(workspaceId, projectIds) {
      const out = new Map<string, ProjectProgress>();
      if (projectIds.length === 0) return out;
      const rows = await db.$queryRaw<LeafRow[]>(Prisma.sql`
        SELECT t.project_id::text AS "projectId", t.progress_pct AS "progressPct",
               t.total_price AS "totalPrice", t.start_date AS "startDate",
               t.due_date AS "dueDate"
        FROM construction_tracking.tasks t
        WHERE t.workspace_id = ${workspaceId}
          AND t.project_id = ANY(${[...new Set(projectIds)]}::uuid[])
          AND t.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM construction_tracking.tasks c
            WHERE c.parent_id = t.id AND c.deleted_at IS NULL)
      `);
      const leaves = new Map<string, RollupLeaf[]>();
      for (const row of rows) {
        const list = leaves.get(row.projectId) ?? [];
        list.push({
          pct: percentFromDb(row.progressPct),
          totalPrice: row.totalPrice,
          startDate: day(row.startDate),
          dueDate: day(row.dueDate),
        });
        leaves.set(row.projectId, list);
      }
      for (const [projectId, list] of leaves) {
        const { pct, weighting } = projectProgress(list);
        if (pct != null && weighting != null)
          out.set(projectId, { pct, weighting });
      }
      return out;
    },
  };
}
