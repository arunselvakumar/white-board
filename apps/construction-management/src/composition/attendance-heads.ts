import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import type {
  DashboardAttendance,
  DashboardNames,
  SiteWorkTx,
} from "@/src/site-work/application/ports";

/** Heads on one date with one Labour Category skill (null = no category). */
export type AttendanceHeadsRow = {
  date: CalendarDate;
  skill: "skilled" | "unskilled" | null;
  heads: number;
};

/**
 * A Project's attendance heads per date and Labour Category skill (CM-0016
 * §6), read from the labour context's tables: labourers present or on a
 * half day (one head each, live rows) and vendor gangs (full-day plus
 * half-day heads on live sheets). The worksheet attendance panel reads one
 * date; the Project Dashboard reads a range (CM-608).
 */
export async function attendanceHeadsBetween(
  db: SiteWorkTx,
  workspaceId: string,
  projectId: string,
  range: { from: CalendarDate; to: CalendarDate },
): Promise<AttendanceHeadsRow[]> {
  const from = calendarDateToDb(range.from);
  const to = calendarDateToDb(range.to);
  const rows = await db.$queryRaw<
    { date: Date; skill: "skilled" | "unskilled" | null; heads: number }[]
  >(Prisma.sql`
    SELECT day AS date, skill, SUM(heads)::int AS heads FROM (
      SELECT a.attendance_date AS day, lc.skill::text AS skill,
             COUNT(*)::int AS heads
      FROM construction_labour.labour_attendance a
      JOIN construction_labour.labours l ON l.id = a.labour_id
      LEFT JOIN construction_masters.labour_categories lc
        ON lc.id = l.labour_category_id
      WHERE a.workspace_id = ${workspaceId}
        AND a.project_id = ${projectId}::uuid
        AND a.attendance_date BETWEEN ${from}::date AND ${to}::date
        AND a.deleted_at IS NULL
        AND a.status IN ('present', 'half_day')
      GROUP BY a.attendance_date, lc.skill
      UNION ALL
      SELECT va.attendance_date, lc.skill::text,
             SUM(line.full_day_count + line.half_day_count)::int
      FROM construction_labour.vendor_attendance va
      JOIN construction_labour.vendor_attendance_lines line
        ON line.attendance_id = va.id
      LEFT JOIN construction_masters.labour_categories lc
        ON lc.id = line.labour_category_id
      WHERE va.workspace_id = ${workspaceId}
        AND va.project_id = ${projectId}::uuid
        AND va.attendance_date BETWEEN ${from}::date AND ${to}::date
        AND va.deleted_at IS NULL
      GROUP BY va.attendance_date, lc.skill
    ) AS heads
    GROUP BY day, skill
    ORDER BY day`);
  return rows.map((row) => ({
    date: calendarDateFromDb(row.date),
    skill: row.skill,
    heads: row.heads,
  }));
}

/** The dashboard's attendance read: heads per date, every skill together. */
export const dashboardAttendance: DashboardAttendance = {
  async headsByDate(db, workspaceId, projectId, range) {
    const rows = await attendanceHeadsBetween(
      db,
      workspaceId,
      projectId,
      range,
    );
    const byDate = new Map<CalendarDate, number>();
    for (const row of rows)
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.heads);
    return [...byDate].map(([date, heads]) => ({ date, heads }));
  },
};

/** Contractor and Department names by id, removed rows included. */
export const dashboardNames: DashboardNames = {
  async contractors(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersContractor.findMany({
      where: { workspaceId, id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  },
  async departments(db, workspaceId, ids) {
    if (ids.length === 0) return new Map();
    const rows = await db.constructionMastersDepartment.findMany({
      where: { workspaceId, id: { in: [...ids] } },
      select: { id: true, name: true },
    });
    return new Map(rows.map((row) => [row.id, row.name]));
  },
};
