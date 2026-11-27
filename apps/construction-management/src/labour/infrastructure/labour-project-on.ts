import { Prisma, type PrismaClient } from "@repo/construction-db";

import {
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

type Db = Pick<
  PrismaClient | Prisma.TransactionClient,
  "constructionLabourEmployeeTransfer"
>;

/**
 * Which of these Employees worked on `projectId` on `date` (CM-206, ADR
 * CM-0033, CM-0055): the latest history row on or before it that names the
 * Project moves them onto it. An Employee may be on other Projects too;
 * attendance (CM-210) marks a day on each Project they were on.
 */
export async function onProjectOn(
  db: Db,
  employeeIds: readonly string[],
  projectId: string,
  date: CalendarDate,
): Promise<Set<string>> {
  if (employeeIds.length === 0) return new Set();
  const rows = await db.constructionLabourEmployeeTransfer.findMany({
    where: {
      employeeId: { in: [...new Set(employeeIds)] },
      transferDate: { lte: calendarDateToDb(date) },
      OR: [{ toProjectId: projectId }, { fromProjectId: projectId }],
    },
    orderBy: [{ transferDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { employeeId: true, toProjectId: true },
  });
  // Oldest first, so the last row seen per Employee wins.
  const on = new Map<string, boolean>();
  for (const row of rows) on.set(row.employeeId, row.toProjectId === projectId);
  return new Set([...on].filter(([, isOn]) => isOn).map(([id]) => id));
}

/**
 * The active Employees on a Project on `date`, whatever their Role (ADR
 * CM-0055 §3): joined by then, and the latest history row on or before it
 * that names the Project moves them onto it. Their other Projects do not
 * matter. Ids only; the caller reads the rows it needs.
 */
export async function activeEmployeeIdsOn(
  db: Pick<PrismaClient | Prisma.TransactionClient, "$queryRaw">,
  workspaceId: string,
  projectId: string,
  date: CalendarDate,
): Promise<string[]> {
  const day = calendarDateToDb(date);
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT e.id::text AS id
    FROM construction_labour.employees e
    WHERE e.workspace_id = ${workspaceId}
      AND e.deleted_at IS NULL
      AND e.is_active
      AND e.joining_date <= ${day}
      AND (
        SELECT t.to_project_id IS NOT DISTINCT FROM ${projectId}::uuid
        FROM construction_labour.employee_transfers t
        WHERE t.employee_id = e.id
          AND t.transfer_date <= ${day}
          AND (t.to_project_id = ${projectId}::uuid
            OR t.from_project_id = ${projectId}::uuid)
        ORDER BY t.transfer_date DESC, t.created_at DESC, t.id DESC
        LIMIT 1
      )
  `);
  return rows.map((row) => row.id);
}
