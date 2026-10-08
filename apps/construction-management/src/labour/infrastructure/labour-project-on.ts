import type { Prisma, PrismaClient } from "@repo/db";

import {
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

type Db = Pick<
  PrismaClient | Prisma.TransactionClient,
  "constructionLabourTransfer"
>;

/**
 * The Project a labourer worked in on `date` (CM-206): the latest history
 * row dated on or before it. Null before the joining date. Attendance
 * (CM-210) marks a day only in this Project.
 */
export async function projectOn(
  db: Db,
  labourId: string,
  date: CalendarDate,
): Promise<string | null> {
  const row = await db.constructionLabourTransfer.findFirst({
    where: { labourId, transferDate: { lte: calendarDateToDb(date) } },
    orderBy: [{ transferDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { toProjectId: true },
  });
  return row?.toProjectId ?? null;
}

/** `projectOn` for many labourers at once; labourers not yet joined are absent. */
export async function projectsOn(
  db: Db,
  labourIds: readonly string[],
  date: CalendarDate,
): Promise<Map<string, string>> {
  if (labourIds.length === 0) return new Map();
  const rows = await db.constructionLabourTransfer.findMany({
    where: {
      labourId: { in: [...new Set(labourIds)] },
      transferDate: { lte: calendarDateToDb(date) },
    },
    orderBy: [{ transferDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: { labourId: true, toProjectId: true },
  });
  // Oldest first, so the last row seen per labourer wins.
  const result = new Map<string, string>();
  for (const row of rows) result.set(row.labourId, row.toProjectId);
  return result;
}
