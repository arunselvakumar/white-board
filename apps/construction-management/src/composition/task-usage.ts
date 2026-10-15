import { Prisma } from "@repo/construction-db";

import type { TaskUsage } from "@/src/tracking/application/ports";

/**
 * Daily Worksheets that name a task (CM-802, ADR CM-0019 §2, §6): a task
 * a live worksheet names cannot be deleted. Tracking never reads
 * site-work tables; this is a plain read of `worksheets.task_id`.
 */
export const siteWorkTaskUsage: TaskUsage = {
  async worksheetCounts(db, workspaceId, taskIds) {
    if (taskIds.length === 0) return new Map();
    const rows = await db.$queryRaw<{ task_id: string; count: number }[]>(
      Prisma.sql`
        SELECT task_id::text AS task_id, count(*)::int AS count
        FROM construction_site_work.worksheets
        WHERE workspace_id = ${workspaceId}
          AND deleted_at IS NULL
          AND task_id IN (${Prisma.join(taskIds.map((id) => Prisma.sql`${id}::uuid`))})
        GROUP BY task_id`,
    );
    return new Map(rows.map((row) => [row.task_id, row.count]));
  },
};
