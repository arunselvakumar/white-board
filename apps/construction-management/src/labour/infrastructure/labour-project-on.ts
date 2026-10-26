import type { Prisma, PrismaClient } from "@repo/construction-db";

import {
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

type Db = Pick<
  PrismaClient | Prisma.TransactionClient,
  "constructionLabourTransfer"
>;

/**
 * Which of these labourers worked on `projectId` on `date` (CM-206, ADR
 * CM-0033): the latest history row on or before it that names the Project
 * moves them onto it. A labourer may be on other Projects too; attendance
 * (CM-210) marks a day on each Project they were on.
 */
export async function onProjectOn(
  db: Db,
  labourIds: readonly string[],
  projectId: string,
  date: CalendarDate,
): Promise<Set<string>> {
  if (labourIds.length === 0) return new Set();
  const rows = await db.constructionLabourTransfer.findMany({
    where: {
      labourId: { in: [...new Set(labourIds)] },
      transferDate: { lte: calendarDateToDb(date) },
      OR: [{ toProjectId: projectId }, { fromProjectId: projectId }],
    },
    orderBy: [{ transferDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { labourId: true, toProjectId: true },
  });
  // Oldest first, so the last row seen per labourer wins.
  const on = new Map<string, boolean>();
  for (const row of rows) on.set(row.labourId, row.toProjectId === projectId);
  return new Set([...on].filter(([, isOn]) => isOn).map(([id]) => id));
}
