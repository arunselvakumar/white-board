import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { storedLocationRef } from "@/src/shared-kernel/location-ref";

import type {
  StoredWorksheet,
  WorksheetListParams,
  WorksheetRow,
  WorksheetStore,
} from "../application/worksheet-handlers";
import type {
  StoredWorksheetSettings,
  WorksheetSettingsStore,
} from "../application/worksheet-settings-handlers";
import {
  isWorksheetSection,
  WORKSHEET_SECTIONS,
  type WorksheetApproval,
  type WorksheetSettings,
} from "../domain/worksheet";

type Db = Prisma.TransactionClient;

const withLines = {
  materials: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.ConstructionSiteWorkWorksheetInclude;

type Row = Prisma.ConstructionSiteWorkWorksheetGetPayload<{
  include: typeof withLines;
}>;

function toStored(row: Row): StoredWorksheet {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    number: row.number,
    sheetDate: calendarDateFromDb(row.sheetDate),
    shift: row.shift,
    contractorId: row.contractorId,
    departmentId: row.departmentId,
    workTypeId: row.workTypeId,
    skilledCount: row.skilledCount,
    unskilledCount: row.unskilledCount,
    approxWorkQty: row.approxWorkQty?.toFixed(3) ?? null,
    approxWorkUnitId: row.approxWorkUnitId,
    taskId: row.taskId,
    siteLocation: storedLocationRef(row.siteLocation),
    remark: row.remark,
    approval: {
      status: row.approvalStatus,
      decidedAt: row.decidedAt,
      decidedBy: row.decidedBy,
      rejectionReason: row.rejectionReason,
    },
    duplicatedFromId: row.duplicatedFromId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    lines: row.materials.map((line) => ({
      id: line.id,
      materialId: line.materialId,
      materialName: line.materialName,
      unitName: line.unitName,
      quantity: line.quantity.toFixed(3),
      remark: line.remark,
    })),
  };
}

function approvalColumns(approval: WorksheetApproval) {
  return {
    approvalStatus: approval.status,
    decidedAt: approval.decidedAt,
    decidedBy: approval.decidedBy,
    rejectionReason: approval.rejectionReason,
  };
}

function contentColumns(row: WorksheetRow) {
  return {
    sheetDate: calendarDateToDb(row.sheetDate),
    shift: row.shift,
    contractorId: row.contractorId,
    departmentId: row.departmentId,
    workTypeId: row.workTypeId,
    skilledCount: row.skilledCount,
    unskilledCount: row.unskilledCount,
    approxWorkQty:
      row.approxWorkQty == null ? null : new Prisma.Decimal(row.approxWorkQty),
    approxWorkUnitId: row.approxWorkUnitId,
    taskId: row.taskId,
    siteLocationType: row.siteLocation?.type ?? null,
    // No location is left out here and written as SQL NULL by
    // `clearSiteLocation`: `next dev` turns `Prisma.DbNull` into `{}`.
    ...(row.siteLocation == null
      ? {}
      : {
          siteLocation: JSON.parse(
            JSON.stringify(row.siteLocation),
          ) as Prisma.InputJsonValue,
        }),
    remark: row.remark,
  };
}

/** Writes SQL NULL to `site_location` (never `{}`, whatever the bundle). */
async function clearSiteLocation(db: Db, id: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE construction_site_work.worksheets
    SET site_location = NULL
    WHERE id = ${id}::uuid`);
}

function lineRows(row: WorksheetRow) {
  return row.lines.map((line, sortOrder) => ({
    id: line.id,
    materialId: line.materialId,
    materialName: line.materialName,
    unitName: line.unitName,
    quantity: new Prisma.Decimal(line.quantity),
    remark: line.remark,
    sortOrder,
  }));
}

/**
 * Daily Worksheets in `construction_site_work.worksheets` and
 * `worksheet_materials` (CM-602). Every method runs on the client it is
 * given, so writes join the caller's transaction.
 */
export class PrismaWorksheetStore implements WorksheetStore {
  async find(db: Db, workspaceId: string, id: string) {
    const row = await db.constructionSiteWorkWorksheet.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: withLines,
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: Db, workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_site_work.worksheets
      WHERE workspace_id = ${workspaceId}
        AND id = ANY(${[...ids]}::uuid[])
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE`);
    const rows = await db.constructionSiteWorkWorksheet.findMany({
      where: { id: { in: [...ids] }, workspaceId, deletedAt: null },
      include: withLines,
    });
    return rows.map(toStored);
  }

  async insert(db: Db, row: Parameters<WorksheetStore["insert"]>[1]) {
    await db.constructionSiteWorkWorksheet.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        number: row.number,
        duplicatedFromId: row.duplicatedFromId,
        ...contentColumns(row),
        ...approvalColumns(row.approval),
        createdAt: row.at,
        updatedAt: row.at,
        createdBy: row.by,
        updatedBy: row.by,
        materials: { create: lineRows(row) },
      },
    });
  }

  async replace(
    db: Db,
    id: string,
    row: Parameters<WorksheetStore["replace"]>[2],
  ) {
    await db.constructionSiteWorkWorksheetMaterial.deleteMany({
      where: { worksheetId: id },
    });
    await db.constructionSiteWorkWorksheet.update({
      where: { id },
      data: {
        ...contentColumns(row),
        ...approvalColumns(row.approval),
        updatedAt: row.at,
        updatedBy: row.by,
        materials: { create: lineRows(row) },
      },
    });
    if (row.siteLocation == null) await clearSiteLocation(db, id);
  }

  async setApproval(
    db: Db,
    id: string,
    approval: WorksheetApproval,
    by: string,
    at: Date,
  ) {
    await db.constructionSiteWorkWorksheet.update({
      where: { id },
      data: { ...approvalColumns(approval), updatedAt: at, updatedBy: by },
    });
  }

  async tombstone(db: Db, id: string, by: string, at: Date) {
    await db.constructionSiteWorkWorksheet.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  }

  async list(db: Db, params: WorksheetListParams) {
    const filters: Prisma.ConstructionSiteWorkWorksheetWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        deletedAt: null,
      },
    ];
    if (params.from != null)
      filters.push({ sheetDate: { gte: calendarDateToDb(params.from) } });
    if (params.to != null)
      filters.push({ sheetDate: { lte: calendarDateToDb(params.to) } });
    if (params.createdBy != null) filters.push({ createdBy: params.createdBy });
    if (params.contractorId != null)
      filters.push({ contractorId: params.contractorId });
    if (params.departmentId != null)
      filters.push({ departmentId: params.departmentId });
    if (params.approvalStatus != null)
      filters.push({ approvalStatus: params.approvalStatus });
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const where = {
      AND:
        cursor == null
          ? filters
          : [
              ...filters,
              {
                OR: backwards
                  ? [
                      { createdAt: { gt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                    ]
                  : [
                      { createdAt: { lt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                    ],
              },
            ],
    };
    const [page, total] = await Promise.all([
      db.constructionSiteWorkWorksheet.findMany({
        where,
        include: withLines,
        orderBy: backwards
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      }),
      db.constructionSiteWorkWorksheet.count({ where: { AND: filters } }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    return { items: rows.map(toStored), hasMore, total };
  }

  async facets(db: Db, workspaceId: string, projectId: string) {
    const rows = await db.constructionSiteWorkWorksheet.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      select: { createdBy: true, contractorId: true, departmentId: true },
      distinct: ["createdBy", "contractorId", "departmentId"],
    });
    return {
      createdBy: [...new Set(rows.map((row) => row.createdBy))],
      contractorIds: [...new Set(rows.map((row) => row.contractorId))],
      departmentIds: [...new Set(rows.map((row) => row.departmentId))],
    };
  }

  async headcounts(
    db: Db,
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
    excludeId: string | null,
  ) {
    const totals = await db.constructionSiteWorkWorksheet.aggregate({
      where: {
        workspaceId,
        projectId,
        sheetDate: calendarDateToDb(date),
        deletedAt: null,
        ...(excludeId == null ? {} : { id: { not: excludeId } }),
      },
      _sum: { skilledCount: true, unskilledCount: true },
    });
    return {
      skilled: totals._sum.skilledCount ?? 0,
      unskilled: totals._sum.unskilledCount ?? 0,
    };
  }
}

type SettingsRow = Prisma.ConstructionSiteWorkWorksheetSettingsGetPayload<
  Record<string, never>
>;

function toSettings(row: SettingsRow): StoredWorksheetSettings {
  const order = row.sectionOrder.filter(isWorksheetSection);
  return {
    showLocation: row.showLocation,
    showWorkType: row.showWorkType,
    showApproxWorkDone: row.showApproxWorkDone,
    showLabour: row.showLabour,
    showMaterials: row.showMaterials,
    showRemark: row.showRemark,
    showPhotos: row.showPhotos,
    sectionOrder:
      order.length === WORKSHEET_SECTIONS.length
        ? order
        : [...WORKSHEET_SECTIONS],
    approvalEnabled: row.approvalEnabled,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

/** A Project's worksheet settings in `construction_site_work.worksheet_settings`. */
export class PrismaWorksheetSettingsStore implements WorksheetSettingsStore {
  async find(db: Db, workspaceId: string, projectId: string) {
    const row = await db.constructionSiteWorkWorksheetSettings.findFirst({
      where: { workspaceId, projectId },
    });
    return row == null ? null : toSettings(row);
  }

  async lock(db: Db, workspaceId: string, projectId: string) {
    await db.$queryRaw(Prisma.sql`
      SELECT project_id FROM construction_site_work.worksheet_settings
      WHERE workspace_id = ${workspaceId} AND project_id = ${projectId}::uuid
      FOR UPDATE`);
    return this.find(db, workspaceId, projectId);
  }

  async save(
    db: Db,
    row: WorksheetSettings & {
      workspaceId: string;
      projectId: string;
      by: string;
      at: Date;
    },
  ) {
    const columns = {
      showLocation: row.showLocation,
      showWorkType: row.showWorkType,
      showApproxWorkDone: row.showApproxWorkDone,
      showLabour: row.showLabour,
      showMaterials: row.showMaterials,
      showRemark: row.showRemark,
      showPhotos: row.showPhotos,
      sectionOrder: [...row.sectionOrder],
      approvalEnabled: row.approvalEnabled,
      updatedAt: row.at,
      updatedBy: row.by,
    };
    await db.constructionSiteWorkWorksheetSettings.upsert({
      where: { projectId: row.projectId },
      create: {
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        ...columns,
      },
      update: columns,
    });
  }
}
