import {
  prisma as defaultPrisma,
  type PrismaClient,
} from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import {
  seriesDates,
  splitBalances,
  type ProjectLabourSummary,
} from "../application/project-labour-summary";
import { prismaLedger } from "./prisma-ledger";
import { companyToday } from "./prisma-labour-queries";

/**
 * The labour numbers on a Project's Overview (CM-219): who is on site
 * today, the last two weeks, and what is owed (ADR CM-0004: balances are
 * sums of ledger entries, party-wide).
 */
export async function projectLabourSummary(
  input: { workspaceId: string; projectId: string; date?: CalendarDate },
  db: PrismaClient = defaultPrisma,
): Promise<ProjectLabourSummary> {
  const { workspaceId, projectId } = input;
  const date = input.date ?? (await companyToday(db, workspaceId));
  const dates = seriesDates(date);
  const from = calendarDateToDb(dates[0] ?? date);
  const to = calendarDateToDb(date);

  const [labourers, vendors, attendance, vendorLines] = await Promise.all([
    db.constructionLabourLabour.findMany({
      where: {
        workspaceId,
        currentProjectId: projectId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    }),
    db.constructionLabourVendor.findMany({
      where: {
        workspaceId,
        isActive: true,
        deletedAt: null,
        projects: { some: { projectId } },
      },
      select: { id: true },
    }),
    db.constructionLabourAttendance.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        attendanceDate: { gte: from, lte: to },
      },
      select: { attendanceDate: true, status: true, labourId: true },
    }),
    db.constructionLabourVendorAttendanceLine.findMany({
      where: {
        attendance: {
          workspaceId,
          projectId,
          deletedAt: null,
          attendanceDate: { gte: from, lte: to },
        },
      },
      select: {
        fullDayCount: true,
        halfDayCount: true,
        attendance: { select: { attendanceDate: true, vendorId: true } },
      },
    }),
  ]);

  const present = new Map<string, number>();
  const heads = new Map<string, number>();
  const today = { present: 0, halfDay: 0, absent: 0, off: 0 };
  for (const row of attendance) {
    const day = calendarDateFromDb(row.attendanceDate);
    if (row.status === "present" || row.status === "half_day")
      present.set(day, (present.get(day) ?? 0) + 1);
    if (day !== date) continue;
    if (row.status === "present") today.present += 1;
    else if (row.status === "half_day") today.halfDay += 1;
    else if (row.status === "absent") today.absent += 1;
    else today.off += 1;
  }
  const vendorsToday = new Set<string>();
  for (const line of vendorLines) {
    const day = calendarDateFromDb(line.attendance.attendanceDate);
    heads.set(
      day,
      (heads.get(day) ?? 0) + line.fullDayCount + line.halfDayCount,
    );
    if (day === date) vendorsToday.add(line.attendance.vendorId);
  }
  const markedToday = today.present + today.halfDay + today.absent + today.off;

  const [labourBalances, vendorBalances] = await Promise.all([
    prismaLedger.balances(
      db,
      workspaceId,
      "labour",
      labourers.map((row) => row.id),
      date,
    ),
    prismaLedger.balances(
      db,
      workspaceId,
      "vendor",
      vendors.map((row) => row.id),
      date,
    ),
  ]);

  return {
    date,
    labourers: {
      onProject: labourers.length,
      ...today,
      unmarked: Math.max(0, labourers.length - markedToday),
    },
    vendors: {
      assigned: vendors.length,
      recordedToday: vendorsToday.size,
      headcountToday: heads.get(date) ?? 0,
    },
    presentSeries: dates.map((day) => ({
      date: day,
      present: present.get(day) ?? 0,
      vendorHeadcount: heads.get(day) ?? 0,
    })),
    labourBalance: splitBalances(labourBalances.values()),
    vendorBalance: splitBalances(vendorBalances.values()),
  };
}
