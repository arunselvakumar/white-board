import { randomUUID } from "node:crypto";

import type { Prisma } from "@repo/whiteboard-db";

import type { DailyReportStore } from "../application/daily-report-ports";
import type { DailyReportView } from "../application/daily-report-views";
import type { AttendanceStatus } from "../domain/attendance";
import { childName } from "../domain/child";
import type { MealEntry, ToiletEntry } from "../domain/daily-report";
import { fromIsoDate, toIsoDate, type IsoDate } from "../domain/dates";
import { PrismaRosterReader } from "./prisma-attendance-store";

type ReportRow = Prisma.PreschoolDailyReportGetPayload<object>;

function toView(row: ReportRow): DailyReportView {
  return {
    id: row.id,
    childId: row.childId,
    classroomId: row.classroomId,
    date: toIsoDate(row.date),
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    // Written only through `dailyReportContent`, so the JSON has its shape.
    meals: row.meals as MealEntry[],
    napFrom: row.napFrom,
    napTo: row.napTo,
    toilet: row.toilet as ToiletEntry[],
    mood: row.mood,
    activities: row.activities,
    note: row.note,
    photos: row.photos,
  };
}

/** Daily Reports in Postgres. */
export class PrismaDailyReportStore
  extends PrismaRosterReader
  implements DailyReportStore
{
  transaction<T>(work: (store: DailyReportStore) => Promise<T>): Promise<T> {
    if (!("$transaction" in this.db)) return work(this);
    return this.db.$transaction((tx) => work(new PrismaDailyReportStore(tx)));
  }

  async reports(
    childIds: readonly string[],
    date: IsoDate,
  ): Promise<Map<string, DailyReportView>> {
    if (childIds.length === 0) return new Map();
    const rows = await this.db.preschoolDailyReport.findMany({
      where: { childId: { in: [...childIds] }, date: fromIsoDate(date) },
    });
    return new Map(rows.map((row) => [row.childId, toView(row)]));
  }

  async lockReport(
    childId: string,
    date: IsoDate,
  ): Promise<DailyReportView | null> {
    const locked = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM preschool.daily_reports
      WHERE child_id = ${childId}::uuid AND date = ${date}::date
      FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await this.db.preschoolDailyReport.findUnique({
      where: { childId_date: { childId, date: fromIsoDate(date) } },
    });
    return row == null ? null : toView(row);
  }

  async saveReport(
    input: Parameters<DailyReportStore["saveReport"]>[0],
  ): Promise<void> {
    // Field by field: callers may pass a whole report view as the content.
    const { content: report } = input;
    const content = {
      meals: report.meals as Prisma.InputJsonValue,
      napFrom: report.napFrom,
      napTo: report.napTo,
      toilet: report.toilet as Prisma.InputJsonValue,
      mood: report.mood,
      activities: report.activities,
      note: report.note,
      photos: report.photos,
      classroomId: input.classroomId,
    };
    await this.db.preschoolDailyReport.upsert({
      where: {
        childId_date: { childId: input.childId, date: fromIsoDate(input.date) },
      },
      create: {
        ...content,
        id: randomUUID(),
        workspaceId: input.workspaceId,
        centreId: input.centreId,
        childId: input.childId,
        date: fromIsoDate(input.date),
        createdByUserId: input.userId,
      },
      update: content,
    });
  }

  async attendance(
    childIds: readonly string[],
    date: IsoDate,
  ): Promise<Map<string, AttendanceStatus>> {
    if (childIds.length === 0) return new Map();
    const rows = await this.db.preschoolAttendance.findMany({
      where: { childId: { in: [...childIds] }, date: fromIsoDate(date) },
      select: { childId: true, status: true },
    });
    return new Map(rows.map((row) => [row.childId, row.status]));
  }

  async publishDrafts(
    input: Parameters<DailyReportStore["publishDrafts"]>[0],
  ): Promise<string[]> {
    const where: Prisma.PreschoolDailyReportWhereInput = {
      classroomId: input.classroomId,
      date: fromIsoDate(input.date),
      status: "draft",
      ...(input.childIds == null
        ? {}
        : { childId: { in: [...input.childIds] } }),
    };
    const drafts = await this.db.preschoolDailyReport.findMany({
      where,
      select: { id: true, childId: true },
    });
    if (drafts.length === 0) return [];
    await this.db.preschoolDailyReport.updateMany({
      where: { id: { in: drafts.map((draft) => draft.id) } },
      data: {
        status: "published",
        publishedAt: input.at,
        publishedByUserId: input.userId,
      },
    });
    return drafts.map((draft) => draft.childId);
  }

  async families(childIds: readonly string[]) {
    if (childIds.length === 0) return [];
    const rows = await this.db.preschoolChild.findMany({
      where: { id: { in: [...childIds] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        centreId: true,
        fatherEmail: true,
        motherEmail: true,
      },
    });
    return rows.map((row) => ({
      childId: row.id,
      childName: childName(row.firstName, row.lastName),
      centreId: row.centreId,
      parentEmails: [
        ...new Set(
          [row.fatherEmail, row.motherEmail].filter(
            (email): email is string => email != null,
          ),
        ),
      ],
    }));
  }

  async childReports(
    childId: string,
    options: { before: IsoDate | null; limit: number; publishedOnly: boolean },
  ): Promise<DailyReportView[]> {
    const rows = await this.db.preschoolDailyReport.findMany({
      where: {
        childId,
        ...(options.before == null
          ? {}
          : { date: { lt: fromIsoDate(options.before) } }),
        ...(options.publishedOnly ? { status: "published" as const } : {}),
      },
      orderBy: { date: "desc" },
      take: options.limit + 1,
    });
    return rows.map(toView);
  }
}
