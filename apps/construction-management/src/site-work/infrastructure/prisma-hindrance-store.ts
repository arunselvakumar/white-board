import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  HindranceContent,
  HindranceListParams,
  HindranceStore,
  HindranceUsageSheet,
  StoredHindrance,
} from "../application/hindrance-handlers";
import type { SiteWorkTx } from "../application/ports";

type Row = Prisma.ConstructionSiteWorkHindranceGetPayload<object>;

/** "16.50" → "16.5", "8.00" → "8". */
function hours(value: Prisma.Decimal | null): string | null {
  if (value == null) return null;
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function toStored(row: Row): StoredHindrance {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    number: row.number,
    startDate: calendarDateFromDb(row.startDate),
    endDate: row.endDate == null ? null : calendarDateFromDb(row.endDate),
    hoursLost: hours(row.hoursLost),
    cause: row.cause,
    affectedActivity: row.affectedActivity,
    siteLocation: (row.siteLocation as LocationRef | null) ?? null,
    responsibleParty: row.responsibleParty,
    contractorId: row.contractorId,
    description: row.description,
    equipmentUsageSheetId: row.equipmentUsageSheetId,
    signOff:
      row.signOffPartyName == null || row.signedOn == null
        ? null
        : {
            userId: row.signOffUserId,
            partyName: row.signOffPartyName,
            partyRole: row.signOffPartyRole,
            signedOn: calendarDateFromDb(row.signedOn),
          },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function columns(content: HindranceContent) {
  return {
    startDate: calendarDateToDb(content.startDate),
    endDate: content.endDate == null ? null : calendarDateToDb(content.endDate),
    hoursLost:
      content.hoursLost == null ? null : new Prisma.Decimal(content.hoursLost),
    cause: content.cause,
    affectedActivity: content.affectedActivity,
    siteLocationType: content.siteLocation?.type ?? null,
    siteLocation:
      content.siteLocation == null
        ? Prisma.DbNull
        : (JSON.parse(
            JSON.stringify(content.siteLocation),
          ) as Prisma.InputJsonValue),
    responsibleParty: content.responsibleParty,
    contractorId: content.contractorId,
    description: content.description,
    equipmentUsageSheetId: content.equipmentUsageSheetId,
    signOffUserId: content.signOff?.userId ?? null,
    signOffPartyName: content.signOff?.partyName ?? null,
    signOffPartyRole: content.signOff?.partyRole ?? null,
    signedOn:
      content.signOff == null
        ? null
        : calendarDateToDb(content.signOff.signedOn),
  };
}

function where(
  params: HindranceListParams,
): Prisma.ConstructionSiteWorkHindranceWhereInput {
  const and: Prisma.ConstructionSiteWorkHindranceWhereInput[] = [];
  if (params.status === "open") and.push({ endDate: null });
  if (params.status === "closed") and.push({ endDate: { not: null } });
  if (params.cause != null) and.push({ cause: params.cause });
  if (params.responsibleParty != null)
    and.push({ responsibleParty: params.responsibleParty });
  if (params.contractorId != null)
    and.push({ contractorId: params.contractorId });
  if (params.to != null)
    and.push({ startDate: { lte: calendarDateToDb(params.to) } });
  if (params.from != null)
    and.push({
      OR: [
        { endDate: null },
        { endDate: { gte: calendarDateToDb(params.from) } },
      ],
    });
  const search = params.search?.trim() ?? "";
  if (search !== "")
    and.push({
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        {
          affectedActivity: {
            contains: search,
            mode: "insensitive",
          },
        },
      ],
    });
  return {
    workspaceId: params.workspaceId,
    projectId: params.projectId,
    deletedAt: null,
    AND: and,
  };
}

/**
 * The Hindrance register in `construction_site_work.hindrances` (CM-607).
 * Every method runs on the client it is given, so writes join the
 * caller's transaction.
 */
export class PrismaHindranceStore implements HindranceStore {
  async find(db: SiteWorkTx, workspaceId: string, id: string) {
    const row = await db.constructionSiteWorkHindrance.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: SiteWorkTx, workspaceId: string, id: string) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_site_work.hindrances
      WHERE workspace_id = ${workspaceId}
        AND id = ${id}::uuid
        AND deleted_at IS NULL
      FOR UPDATE`);
    return this.find(db, workspaceId, id);
  }

  async insert(
    db: SiteWorkTx,
    row: Parameters<HindranceStore["insert"]>[1],
  ): Promise<void> {
    await db.constructionSiteWorkHindrance.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        number: row.number,
        ...columns(row),
        createdAt: row.at,
        updatedAt: row.at,
        createdBy: row.by,
        updatedBy: row.by,
      },
    });
  }

  async replace(
    db: SiteWorkTx,
    id: string,
    content: HindranceContent & { by: string; at: Date },
  ): Promise<void> {
    await db.constructionSiteWorkHindrance.update({
      where: { id },
      data: {
        ...columns(content),
        updatedAt: content.at,
        updatedBy: content.by,
      },
    });
  }

  async close(
    db: SiteWorkTx,
    id: string,
    values: {
      endDate: CalendarDate;
      hoursLost: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void> {
    await db.constructionSiteWorkHindrance.update({
      where: { id },
      data: {
        endDate: calendarDateToDb(values.endDate),
        hoursLost:
          values.hoursLost == null
            ? null
            : new Prisma.Decimal(values.hoursLost),
        updatedAt: values.at,
        updatedBy: values.by,
      },
    });
  }

  async tombstone(
    db: SiteWorkTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void> {
    await db.constructionSiteWorkHindrance.update({
      where: { id },
      data: tombstone(by, at),
    });
  }

  async list(db: SiteWorkTx, params: HindranceListParams) {
    const filter = where(params);
    const cursor = params.after ?? params.before;
    const backwards = params.before != null;
    const page =
      cursor == null
        ? {}
        : backwards
          ? {
              OR: [
                { createdAt: { gt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { gt: cursor.id } },
              ],
            }
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            };
    const order = backwards ? "asc" : "desc";
    const [found, total] = await Promise.all([
      db.constructionSiteWorkHindrance.findMany({
        where: { AND: [filter, page] },
        orderBy: [{ createdAt: order }, { id: order }],
        take: params.limit + 1,
      }),
      db.constructionSiteWorkHindrance.count({ where: filter }),
    ]);
    const hasMore = found.length > params.limit;
    const items = found.slice(0, params.limit);
    if (backwards) items.reverse();
    return { items: items.map(toStored), hasMore, total };
  }

  async openOn(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ) {
    const day = calendarDateToDb(date);
    const found = await db.constructionSiteWorkHindrance.findMany({
      where: {
        workspaceId,
        projectId,
        deletedAt: null,
        startDate: { lte: day },
        OR: [{ endDate: null }, { endDate: { gte: day } }],
      },
      orderBy: [{ startDate: "asc" }, { number: "asc" }],
    });
    return found.map(toStored);
  }

  async usageSheets(
    db: SiteWorkTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, HindranceUsageSheet>> {
    if (ids.length === 0) return new Map();
    const found = await db.constructionSiteWorkEquipmentUsageSheet.findMany({
      where: { workspaceId, id: { in: [...ids] }, deletedAt: null },
      select: { id: true, projectId: true, number: true, sheetDate: true },
    });
    return new Map(
      found.map((row) => [
        row.id,
        {
          id: row.id,
          projectId: row.projectId,
          number: row.number,
          sheetDate: calendarDateFromDb(row.sheetDate),
        },
      ]),
    );
  }
}
