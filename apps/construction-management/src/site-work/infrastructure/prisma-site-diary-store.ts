import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type { SiteWorkTx } from "../application/ports";
import {
  siteDiaryExists,
  type SiteDiaryDay,
  type SiteDiaryStore,
  type StoredSiteDiary,
} from "../application/site-diary-handlers";
import type { SiteDiaryContent } from "../domain/site-diary";

const withRows = {
  visitors: { orderBy: { sortOrder: "asc" } },
  instructions: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.ConstructionSiteWorkSiteDiaryInclude;

type Row = Prisma.ConstructionSiteWorkSiteDiaryGetPayload<{
  include: typeof withRows;
}>;

/** "12.50" → "12.5"; Prisma decimals keep the column's scale. */
function decimal(value: Prisma.Decimal | null): string | null {
  return value == null ? null : value.toFixed(1).replace(/\.0$/, "");
}

function toStored(row: Row): StoredSiteDiary {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    diaryDate: calendarDateFromDb(row.diaryDate),
    weatherMorning: row.weatherMorning,
    weatherAfternoon: row.weatherAfternoon,
    rainfallMm: decimal(row.rainfallMm),
    siteCondition: row.siteCondition,
    notes: row.notes,
    visitors: row.visitors.map((v) => ({
      name: v.name,
      organisation: v.organisation,
      purpose: v.purpose,
      timeIn: v.timeIn,
      timeOut: v.timeOut,
    })),
    instructions: row.instructions.map((i) => ({
      givenBy: i.givenBy,
      givenTo: i.givenTo,
      instruction: i.instruction,
      actionTaken: i.actionTaken,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function columns(content: SiteDiaryContent) {
  return {
    diaryDate: calendarDateToDb(content.diaryDate),
    weatherMorning: content.weatherMorning,
    weatherAfternoon: content.weatherAfternoon,
    rainfallMm:
      content.rainfallMm == null
        ? null
        : new Prisma.Decimal(content.rainfallMm),
    siteCondition: content.siteCondition,
    notes: content.notes,
  };
}

function rows(content: SiteDiaryContent) {
  return {
    visitors: {
      create: content.visitors.map((v, sortOrder) => ({
        id: newId(),
        sortOrder,
        ...v,
      })),
    },
    instructions: {
      create: content.instructions.map((i, sortOrder) => ({
        id: newId(),
        sortOrder,
        ...i,
      })),
    },
  };
}

/**
 * Site Diaries in `construction_site_work.site_diaries` with their visitor
 * and instruction rows (CM-607). The live-date unique index
 * (`site_diaries_live_date_key`) backs the one-per-date rule under races.
 */
export class PrismaSiteDiaryStore implements SiteDiaryStore {
  async find(db: SiteWorkTx, workspaceId: string, id: string) {
    const row = await db.constructionSiteWorkSiteDiary.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: withRows,
    });
    return row == null ? null : toStored(row);
  }

  async findByDate(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ) {
    const row = await db.constructionSiteWorkSiteDiary.findFirst({
      where: {
        workspaceId,
        projectId,
        diaryDate: calendarDateToDb(date),
        deletedAt: null,
      },
      include: withRows,
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: SiteWorkTx, workspaceId: string, id: string) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_site_work.site_diaries
      WHERE workspace_id = ${workspaceId}
        AND id = ${id}::uuid
        AND deleted_at IS NULL
      FOR UPDATE`);
    return this.find(db, workspaceId, id);
  }

  async insert(
    db: SiteWorkTx,
    row: Parameters<SiteDiaryStore["insert"]>[1],
  ): Promise<void> {
    const existing = await this.findByDate(
      db,
      row.workspaceId,
      row.projectId,
      row.diaryDate,
    );
    if (existing != null) throw siteDiaryExists(row.diaryDate);
    try {
      await db.constructionSiteWorkSiteDiary.create({
        data: {
          id: row.id,
          workspaceId: row.workspaceId,
          projectId: row.projectId,
          ...columns(row),
          createdAt: row.at,
          updatedAt: row.at,
          createdBy: row.by,
          updatedBy: row.by,
          ...rows(row),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw siteDiaryExists(row.diaryDate);
      throw error;
    }
  }

  async replace(
    db: SiteWorkTx,
    id: string,
    content: SiteDiaryContent & { by: string; at: Date },
  ): Promise<void> {
    await db.constructionSiteWorkSiteDiaryVisitor.deleteMany({
      where: { diaryId: id },
    });
    await db.constructionSiteWorkSiteDiaryInstruction.deleteMany({
      where: { diaryId: id },
    });
    try {
      await db.constructionSiteWorkSiteDiary.update({
        where: { id },
        data: {
          ...columns(content),
          updatedAt: content.at,
          updatedBy: content.by,
          ...rows(content),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw siteDiaryExists(content.diaryDate);
      throw error;
    }
  }

  async tombstone(
    db: SiteWorkTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void> {
    await db.constructionSiteWorkSiteDiary.update({
      where: { id },
      data: tombstone(by, at),
    });
  }

  async days(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<SiteDiaryDay[]> {
    const found = await db.constructionSiteWorkSiteDiary.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        diaryDate: { gte: calendarDateToDb(from), lte: calendarDateToDb(to) },
      },
      orderBy: { diaryDate: "desc" },
      select: {
        id: true,
        diaryDate: true,
        weatherMorning: true,
        weatherAfternoon: true,
        rainfallMm: true,
        _count: { select: { visitors: true, instructions: true } },
      },
    });
    return found.map((row) => ({
      id: row.id,
      diaryDate: calendarDateFromDb(row.diaryDate),
      weatherMorning: row.weatherMorning,
      weatherAfternoon: row.weatherAfternoon,
      rainfallMm: decimal(row.rainfallMm),
      visitorCount: row._count.visitors,
      instructionCount: row._count.instructions,
    }));
  }
}
