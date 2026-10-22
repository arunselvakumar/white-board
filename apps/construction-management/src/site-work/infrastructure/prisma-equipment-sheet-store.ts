import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { storedLocationRef } from "@/src/shared-kernel/location-ref";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";

import type {
  EquipmentSheetListParams,
  EquipmentSheetRow,
  EquipmentSheetStore,
  SheetEquipmentSummary,
  StoredEquipmentSheet,
} from "../application/equipment-sheet-handlers";
import type {
  EquipmentSheetSettingsStore,
  StoredEquipmentSheetSettings,
} from "../application/equipment-sheet-settings-handlers";
import {
  equipmentSheetExists,
  type EquipmentSheetApproval,
  type EquipmentSheetSettings,
} from "../domain/equipment-usage";

type Db = Prisma.TransactionClient;

const withChildren = {
  materials: { orderBy: { sortOrder: "asc" } },
  timeShifts: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.ConstructionSiteWorkEquipmentUsageSheetInclude;

type Row = Prisma.ConstructionSiteWorkEquipmentUsageSheetGetPayload<{
  include: typeof withChildren;
}>;

const fixed = (value: Prisma.Decimal | null, scale: number) =>
  value == null ? null : value.toFixed(scale);

const decimal = (value: string | null) =>
  value == null ? null : new Prisma.Decimal(value);

function toStored(row: Row): StoredEquipmentSheet {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    number: row.number,
    equipmentId: row.equipmentId,
    ownership: row.ownership,
    utilisationBasis: row.utilisationBasis,
    workingTimeMethod: row.workingTimeMethod,
    sheetDate: calendarDateFromDb(row.sheetDate),
    shift: row.shift,
    operatorName: row.operatorName,
    supervisorUserId: row.supervisorUserId,
    contractorId: row.contractorId,
    departmentId: row.departmentId,
    workItem: row.workItem,
    siteLocation: storedLocationRef(row.siteLocation),
    timeShifts: row.timeShifts.map((shift) => ({
      startTime: shift.startTime,
      endTime: shift.endTime,
      minutes: shift.minutes,
    })),
    openingReading: fixed(row.openingReading, 2),
    closingReading: fixed(row.closingReading, 2),
    usageHours: fixed(row.usageHours, 2),
    distanceKm: fixed(row.distanceKm, 2),
    trips: row.trips,
    idleHours: row.idleHours.toFixed(2),
    breakdownHours: row.breakdownHours.toFixed(2),
    approxWorkQty: fixed(row.approxWorkQty, 3),
    approxWorkUnitId: row.approxWorkUnitId,
    fuelQty: fixed(row.fuelQty, 3),
    fuelBorneBy: row.fuelBorneBy,
    fuelOverrun: row.fuelOverrun,
    unitRate: row.unitRate,
    billableQty: fixed(row.billableQty, 3),
    hireCost: row.hireCost,
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

function approvalColumns(approval: EquipmentSheetApproval) {
  return {
    approvalStatus: approval.status,
    decidedAt: approval.decidedAt,
    decidedBy: approval.decidedBy,
    rejectionReason: approval.rejectionReason,
  };
}

function contentColumns(row: EquipmentSheetRow) {
  return {
    sheetDate: calendarDateToDb(row.sheetDate),
    shift: row.shift,
    operatorName: row.operatorName,
    supervisorUserId: row.supervisorUserId,
    contractorId: row.contractorId,
    departmentId: row.departmentId,
    workItem: row.workItem,
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
    usageHours: decimal(row.usageHours),
    distanceKm: decimal(row.distanceKm),
    trips: row.trips,
    openingReading: decimal(row.openingReading),
    closingReading: decimal(row.closingReading),
    idleHours: new Prisma.Decimal(row.idleHours),
    breakdownHours: new Prisma.Decimal(row.breakdownHours),
    approxWorkQty: decimal(row.approxWorkQty),
    approxWorkUnitId: row.approxWorkUnitId,
    fuelQty: decimal(row.fuelQty),
    fuelBorneBy: row.fuelBorneBy,
    fuelOverrun: row.fuelOverrun,
    unitRate: row.unitRate,
    billableQty: decimal(row.billableQty),
    hireCost: row.hireCost,
    remark: row.remark,
  };
}

/** Writes SQL NULL to `site_location` (never `{}`, whatever the bundle). */
async function clearSiteLocation(db: Db, id: string): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    UPDATE construction_site_work.equipment_usage_sheets
    SET site_location = NULL
    WHERE id = ${id}::uuid`);
}

function childRows(row: EquipmentSheetRow) {
  return {
    materials: {
      create: row.lines.map((line, sortOrder) => ({
        id: line.id,
        materialId: line.materialId,
        materialName: line.materialName,
        unitName: line.unitName,
        quantity: new Prisma.Decimal(line.quantity),
        remark: line.remark,
        sortOrder,
      })),
    },
    timeShifts: {
      create: row.timeShifts.map((shift, sortOrder) => ({
        id: newId(),
        startTime: shift.startTime,
        endTime: shift.endTime,
        minutes: shift.minutes,
        sortOrder,
      })),
    },
  };
}

/**
 * Equipment Usage sheets in `construction_site_work.equipment_usage_sheets`
 * with their `equipment_time_shifts` and `equipment_usage_materials`
 * (CM-604). The live-shift unique index (`equipment_usage_sheets_live_shift_key`)
 * backs the one-sheet-per-equipment-date-shift rule under races. Every
 * method runs on the client it is given, so writes join the caller's
 * transaction.
 */
export class PrismaEquipmentSheetStore implements EquipmentSheetStore {
  async find(db: Db, workspaceId: string, id: string) {
    const row = await db.constructionSiteWorkEquipmentUsageSheet.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: withChildren,
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: Db, workspaceId: string, ids: readonly string[]) {
    if (ids.length === 0) return [];
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_site_work.equipment_usage_sheets
      WHERE workspace_id = ${workspaceId}
        AND id = ANY(${[...ids]}::uuid[])
        AND deleted_at IS NULL
      ORDER BY id
      FOR UPDATE`);
    const rows = await db.constructionSiteWorkEquipmentUsageSheet.findMany({
      where: { id: { in: [...ids] }, workspaceId, deletedAt: null },
      include: withChildren,
    });
    return rows.map(toStored);
  }

  async insert(db: Db, row: Parameters<EquipmentSheetStore["insert"]>[1]) {
    try {
      await db.constructionSiteWorkEquipmentUsageSheet.create({
        data: {
          id: row.id,
          workspaceId: row.workspaceId,
          projectId: row.projectId,
          number: row.number,
          equipmentId: row.equipmentId,
          ownership: row.ownership,
          utilisationBasis: row.utilisationBasis,
          workingTimeMethod: row.workingTimeMethod,
          duplicatedFromId: row.duplicatedFromId,
          ...contentColumns(row),
          ...approvalColumns(row.approval),
          createdAt: row.at,
          updatedAt: row.at,
          createdBy: row.by,
          updatedBy: row.by,
          ...childRows(row),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw equipmentSheetExists();
      throw error;
    }
  }

  async replace(
    db: Db,
    id: string,
    row: Parameters<EquipmentSheetStore["replace"]>[2],
  ) {
    await db.constructionSiteWorkEquipmentUsageMaterial.deleteMany({
      where: { sheetId: id },
    });
    await db.constructionSiteWorkEquipmentTimeShift.deleteMany({
      where: { sheetId: id },
    });
    try {
      await db.constructionSiteWorkEquipmentUsageSheet.update({
        where: { id },
        data: {
          ...contentColumns(row),
          ...approvalColumns(row.approval),
          updatedAt: row.at,
          updatedBy: row.by,
          ...childRows(row),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw equipmentSheetExists();
      throw error;
    }
    if (row.siteLocation == null) await clearSiteLocation(db, id);
  }

  async setApproval(
    db: Db,
    id: string,
    approval: EquipmentSheetApproval,
    by: string,
    at: Date,
  ) {
    await db.constructionSiteWorkEquipmentUsageSheet.update({
      where: { id },
      data: { ...approvalColumns(approval), updatedAt: at, updatedBy: by },
    });
  }

  async tombstone(db: Db, id: string, by: string, at: Date) {
    await db.constructionSiteWorkEquipmentUsageSheet.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  }

  async taken(
    db: Db,
    equipmentId: string,
    date: CalendarDate,
    shift: string,
    exceptId: string | null,
  ) {
    const found = await db.constructionSiteWorkEquipmentUsageSheet.findFirst({
      where: {
        equipmentId,
        sheetDate: calendarDateToDb(date),
        shift: shift as Row["shift"],
        deletedAt: null,
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    return found != null;
  }

  async previousClosing(
    db: Db,
    equipmentId: string,
    date: CalendarDate,
    shift: string,
    exceptId: string | null,
  ) {
    const rows = await db.$queryRaw<
      { reading: Prisma.Decimal; sheetDate: Date }[]
    >(Prisma.sql`
      SELECT closing_reading AS reading, sheet_date AS "sheetDate"
      FROM construction_site_work.equipment_usage_sheets
      WHERE equipment_id = ${equipmentId}::uuid
        AND deleted_at IS NULL
        AND closing_reading IS NOT NULL
        AND id <> ${exceptId ?? "00000000-0000-0000-0000-000000000000"}::uuid
        AND (sheet_date < ${calendarDateToDb(date)}::date
          OR (sheet_date = ${calendarDateToDb(date)}::date
            AND shift < ${shift}::construction_site_work.shift))
      ORDER BY sheet_date DESC, shift DESC, created_at DESC
      LIMIT 1`);
    const row = rows[0];
    return row == null
      ? null
      : {
          reading: new Prisma.Decimal(row.reading).toFixed(2),
          sheetDate: calendarDateFromDb(row.sheetDate),
        };
  }

  async list(db: Db, params: EquipmentSheetListParams) {
    const filters: Prisma.ConstructionSiteWorkEquipmentUsageSheetWhereInput[] =
      [
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
    if (params.equipmentId != null)
      filters.push({ equipmentId: params.equipmentId });
    if (params.ownership != null) filters.push({ ownership: params.ownership });
    if (params.createdBy != null) filters.push({ createdBy: params.createdBy });
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
    const [page, total, sums] = await Promise.all([
      db.constructionSiteWorkEquipmentUsageSheet.findMany({
        where,
        include: withChildren,
        orderBy: backwards
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      }),
      db.constructionSiteWorkEquipmentUsageSheet.count({
        where: { AND: filters },
      }),
      db.constructionSiteWorkEquipmentUsageSheet.aggregate({
        where: { AND: filters },
        _sum: {
          usageHours: true,
          distanceKm: true,
          trips: true,
          idleHours: true,
          breakdownHours: true,
        },
      }),
    ]);
    const hasMore = page.length > params.limit;
    const rows = page.slice(0, params.limit);
    if (backwards) rows.reverse();
    const sum = (value: Prisma.Decimal | null) =>
      (value ?? new Prisma.Decimal(0)).toFixed(2);
    return {
      items: rows.map(toStored),
      hasMore,
      total,
      totals: {
        usageHours: sum(sums._sum.usageHours),
        distanceKm: sum(sums._sum.distanceKm),
        trips: sums._sum.trips ?? 0,
        idleHours: sum(sums._sum.idleHours),
        breakdownHours: sum(sums._sum.breakdownHours),
      },
    };
  }

  async facets(db: Db, workspaceId: string, projectId: string) {
    const rows = await db.constructionSiteWorkEquipmentUsageSheet.findMany({
      where: { workspaceId, projectId, deletedAt: null },
      select: { createdBy: true, equipmentId: true },
      distinct: ["createdBy", "equipmentId"],
    });
    return {
      createdBy: [...new Set(rows.map((row) => row.createdBy))],
      equipmentIds: [...new Set(rows.map((row) => row.equipmentId))],
    };
  }

  async equipment(db: Db, workspaceId: string, ids: readonly string[]) {
    const result = new Map<string, SheetEquipmentSummary>();
    if (ids.length === 0) return result;
    const rows = await db.constructionSiteWorkEquipment.findMany({
      where: { workspaceId, id: { in: [...new Set(ids)] } },
    });
    for (const row of rows)
      result.set(row.id, {
        id: row.id,
        name: row.name,
        equipmentNumber: row.equipmentNumber,
        fuelUnit: row.fuelUnit,
        expectedFuelEfficiency: fixed(row.expectedFuelEfficiency, 3),
        hirePartyId: row.hirePartyId,
        hireBasis: row.hireBasis,
        hireRate: row.hireRate,
        idleChargeable: row.idleChargeable,
      });
    return result;
  }
}

type SettingsRow = Prisma.ConstructionSiteWorkEquipmentSheetSettingsGetPayload<
  Record<string, never>
>;

function toSettings(row: SettingsRow): StoredEquipmentSheetSettings {
  return {
    showOperator: row.showOperator,
    showSupervisor: row.showSupervisor,
    showLocation: row.showLocation,
    showApproxWorkDone: row.showApproxWorkDone,
    showBillableQty: row.showBillableQty,
    showFuel: row.showFuel,
    showRemarks: row.showRemarks,
    showFiles: row.showFiles,
    showMaterials: row.showMaterials,
    showMeterReadings: row.showMeterReadings,
    showBreakdownHours: row.showBreakdownHours,
    approvalEnabled: row.approvalEnabled,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}

/** A Project's equipment-sheet settings in `construction_site_work.equipment_sheet_settings`. */
export class PrismaEquipmentSheetSettingsStore implements EquipmentSheetSettingsStore {
  async find(db: Db, workspaceId: string, projectId: string) {
    const row = await db.constructionSiteWorkEquipmentSheetSettings.findFirst({
      where: { workspaceId, projectId },
    });
    return row == null ? null : toSettings(row);
  }

  async lock(db: Db, workspaceId: string, projectId: string) {
    await db.$queryRaw(Prisma.sql`
      SELECT project_id FROM construction_site_work.equipment_sheet_settings
      WHERE workspace_id = ${workspaceId} AND project_id = ${projectId}::uuid
      FOR UPDATE`);
    return this.find(db, workspaceId, projectId);
  }

  async save(
    db: Db,
    row: EquipmentSheetSettings & {
      workspaceId: string;
      projectId: string;
      by: string;
      at: Date;
    },
  ) {
    const columns = {
      showOperator: row.showOperator,
      showSupervisor: row.showSupervisor,
      showLocation: row.showLocation,
      showApproxWorkDone: row.showApproxWorkDone,
      showBillableQty: row.showBillableQty,
      showFuel: row.showFuel,
      showRemarks: row.showRemarks,
      showFiles: row.showFiles,
      showMaterials: row.showMaterials,
      showMeterReadings: row.showMeterReadings,
      showBreakdownHours: row.showBreakdownHours,
      approvalEnabled: row.approvalEnabled,
      updatedAt: row.at,
      updatedBy: row.by,
    };
    await db.constructionSiteWorkEquipmentSheetSettings.upsert({
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
