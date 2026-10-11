import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { tombstone } from "@/src/shared-kernel/tombstone";

import type {
  EquipmentLifecycleFacts,
  EquipmentListParams,
  EquipmentStore,
  StoredEquipment,
  StoredMaintenance,
  StoredMovement,
} from "../application/equipment-handlers";
import { equipmentNumberTaken } from "../domain/equipment";
import { maintenanceAlreadyOpen } from "../domain/equipment-lifecycle";

type Db = Prisma.TransactionClient;

const OPEN_MAINTENANCE = {
  maintenance: {
    where: { endDate: null, deletedAt: null },
    orderBy: { startDate: "desc" },
    take: 1,
  },
} satisfies Prisma.ConstructionSiteWorkEquipmentInclude;

type Row = Prisma.ConstructionSiteWorkEquipmentGetPayload<{
  include: typeof OPEN_MAINTENANCE;
}>;

type MaintenanceRow =
  Prisma.ConstructionSiteWorkEquipmentMaintenanceGetPayload<object>;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function toMaintenance(row: MaintenanceRow): StoredMaintenance {
  return {
    id: row.id,
    equipmentId: row.equipmentId,
    kind: row.kind,
    startDate: calendarDateFromDb(row.startDate),
    endDate: row.endDate == null ? null : calendarDateFromDb(row.endDate),
    description: row.description,
    workshop: row.workshop,
    cost: row.cost,
    remark: row.remark,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toStored(row: Row): StoredEquipment {
  const open = row.maintenance[0];
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    ownership: row.ownership,
    name: row.name,
    equipmentNumber: row.equipmentNumber,
    purchaseYear: row.purchaseYear,
    fuelType: row.fuelType,
    fuelUnit: row.fuelUnit,
    utilisationBasis: row.utilisationBasis,
    workingTimeMethod: row.workingTimeMethod,
    targetValue: row.targetValue?.toFixed(2) ?? null,
    targetUnit: row.targetUnit,
    minUtilisationPct: row.minUtilisationPct?.toFixed(2) ?? null,
    expectedFuelEfficiency: row.expectedFuelEfficiency?.toFixed(3) ?? null,
    contactPersonName: row.contactPersonName,
    contactPersonNumber: row.contactPersonNumber,
    companyName: row.companyName,
    hirePartyId: row.hirePartyId,
    hireBasis: row.hireBasis,
    hireRate: row.hireRate,
    idleChargeable: row.idleChargeable,
    photoKey: row.photoKey,
    photoThumbKey: row.photoThumbKey,
    currentProjectId: row.currentProjectId,
    currentLocationName: row.currentLocationName,
    availableForEntry: row.availableForEntry,
    unavailableSince:
      row.unavailableSince == null
        ? null
        : calendarDateFromDb(row.unavailableSince),
    openMaintenance: open == null ? null : toMaintenance(open),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function decimal(value: string | null): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value);
}

function fieldColumns(fields: Parameters<EquipmentStore["update"]>[2]) {
  return {
    ownership: fields.ownership,
    name: fields.name,
    equipmentNumber: fields.equipmentNumber,
    purchaseYear: fields.purchaseYear,
    fuelType: fields.fuelType,
    fuelUnit: fields.fuelUnit,
    utilisationBasis: fields.utilisationBasis,
    workingTimeMethod: fields.workingTimeMethod,
    targetValue: decimal(fields.targetValue),
    targetUnit: fields.targetUnit,
    minUtilisationPct: decimal(fields.minUtilisationPct),
    expectedFuelEfficiency: decimal(fields.expectedFuelEfficiency),
    contactPersonName: fields.contactPersonName,
    contactPersonNumber: fields.contactPersonNumber,
    companyName: fields.companyName,
    hirePartyId: fields.hirePartyId,
    hireBasis: fields.hireBasis,
    hireRate: fields.hireRate,
    idleChargeable: fields.idleChargeable,
  };
}

function listWhere(
  params: EquipmentListParams,
): Prisma.ConstructionSiteWorkEquipmentWhereInput {
  const where: Prisma.ConstructionSiteWorkEquipmentWhereInput[] = [
    { workspaceId: params.workspaceId, deletedAt: null },
  ];
  if (params.ownership != null) where.push({ ownership: params.ownership });
  if (params.projectId != null)
    where.push({ currentProjectId: params.projectId });
  if (params.warehouse === true) where.push({ currentProjectId: null });
  const open = { endDate: null, deletedAt: null };
  if (params.state === "in_maintenance")
    where.push({ maintenance: { some: open } });
  if (params.state === "unavailable")
    where.push({ availableForEntry: false, maintenance: { none: open } });
  if (params.state === "available")
    where.push({ availableForEntry: true, maintenance: { none: open } });
  const search = params.search?.trim() ?? "";
  if (search !== "")
    where.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { equipmentNumber: { contains: search, mode: "insensitive" } },
      ],
    });
  return { AND: where };
}

/**
 * The Equipment register in `construction_site_work.equipment`, its
 * `equipment_movements` and `equipment_maintenance`, and what it reads of
 * `equipment_usage_sheets` (CM-603, CM-605). Every method runs on the
 * client it is given, so writes join the caller's transaction.
 */
export class PrismaEquipmentStore implements EquipmentStore {
  async find(db: Db, workspaceId: string, id: string) {
    const row = await db.constructionSiteWorkEquipment.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: OPEN_MAINTENANCE,
    });
    return row == null ? null : toStored(row);
  }

  async lock(db: Db, workspaceId: string, id: string) {
    await db.$queryRaw(Prisma.sql`
      SELECT id FROM construction_site_work.equipment
      WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}
        AND deleted_at IS NULL
      FOR UPDATE`);
    return this.find(db, workspaceId, id);
  }

  async numberTaken(
    db: Db,
    workspaceId: string,
    equipmentNumber: string,
    exceptId: string | null,
  ) {
    const found = await db.constructionSiteWorkEquipment.findFirst({
      where: {
        workspaceId,
        deletedAt: null,
        equipmentNumber: { equals: equipmentNumber, mode: "insensitive" },
        ...(exceptId == null ? {} : { id: { not: exceptId } }),
      },
      select: { id: true },
    });
    return found != null;
  }

  async insert(db: Db, row: Parameters<EquipmentStore["insert"]>[1]) {
    try {
      await db.constructionSiteWorkEquipment.create({
        data: {
          id: row.id,
          workspaceId: row.workspaceId,
          ...fieldColumns(row),
          currentProjectId: row.currentProjectId,
          currentLocationName: row.currentLocationName,
          createdAt: row.at,
          updatedAt: row.at,
          createdBy: row.by,
          updatedBy: row.by,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw equipmentNumberTaken(row.equipmentNumber);
      throw error;
    }
  }

  async update(
    db: Db,
    id: string,
    fields: Parameters<EquipmentStore["update"]>[2],
    by: string,
    at: Date,
  ) {
    try {
      await db.constructionSiteWorkEquipment.update({
        where: { id },
        data: { ...fieldColumns(fields), updatedAt: at, updatedBy: by },
      });
    } catch (error) {
      if (isUniqueViolation(error))
        throw equipmentNumberTaken(fields.equipmentNumber);
      throw error;
    }
  }

  async setPlace(
    db: Db,
    id: string,
    place: { projectId: string | null; locationName: string },
    by: string,
    at: Date,
  ) {
    await db.constructionSiteWorkEquipment.update({
      where: { id },
      data: {
        currentProjectId: place.projectId,
        currentLocationName: place.locationName,
        updatedAt: at,
        updatedBy: by,
      },
    });
  }

  async setAvailability(
    db: Db,
    id: string,
    availability: {
      availableForEntry: boolean;
      unavailableSince: CalendarDate | null;
    },
    by: string,
    at: Date,
  ) {
    await db.constructionSiteWorkEquipment.update({
      where: { id },
      data: {
        availableForEntry: availability.availableForEntry,
        unavailableSince:
          availability.unavailableSince == null
            ? null
            : calendarDateToDb(availability.unavailableSince),
        updatedAt: at,
        updatedBy: by,
      },
    });
  }

  async setPhoto(
    db: Db,
    id: string,
    photo: { key: string; thumbKey: string | null } | null,
    by: string,
    at: Date,
  ) {
    await db.constructionSiteWorkEquipment.update({
      where: { id },
      data: {
        photoKey: photo?.key ?? null,
        photoThumbKey: photo?.thumbKey ?? null,
        updatedAt: at,
        updatedBy: by,
      },
    });
  }

  async touch(db: Db, id: string, by: string, at: Date) {
    await db.constructionSiteWorkEquipment.update({
      where: { id },
      data: { updatedAt: at, updatedBy: by },
    });
  }

  async tombstone(db: Db, id: string, by: string, at: Date) {
    await db.constructionSiteWorkEquipment.update({
      where: { id },
      data: tombstone(by, at),
    });
  }

  async movements(db: Db, equipmentId: string): Promise<StoredMovement[]> {
    const rows = await db.constructionSiteWorkEquipmentMovement.findMany({
      where: { equipmentId },
      orderBy: [{ movementDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      equipmentId: row.equipmentId,
      kind: row.kind,
      movementDate: calendarDateFromDb(row.movementDate),
      fromProjectId: row.fromProjectId,
      toProjectId: row.toProjectId,
      locationName: row.locationName,
      remark: row.remark,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  }

  async appendMovement(
    db: Db,
    row: Parameters<EquipmentStore["appendMovement"]>[1],
  ) {
    await db.constructionSiteWorkEquipmentMovement.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        equipmentId: row.equipmentId,
        kind: row.kind,
        movementDate: calendarDateToDb(row.movementDate),
        fromProjectId: row.fromProjectId,
        toProjectId: row.toProjectId,
        locationName: row.locationName,
        remark: row.remark,
        createdAt: row.at,
        createdBy: row.createdBy,
      },
    });
  }

  async maintenance(db: Db, equipmentId: string) {
    const rows = await db.constructionSiteWorkEquipmentMaintenance.findMany({
      where: { equipmentId, deletedAt: null },
      orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(toMaintenance);
  }

  async insertMaintenance(
    db: Db,
    row: Parameters<EquipmentStore["insertMaintenance"]>[1],
  ) {
    try {
      await db.constructionSiteWorkEquipmentMaintenance.create({
        data: {
          id: row.id,
          workspaceId: row.workspaceId,
          equipmentId: row.equipmentId,
          kind: row.kind,
          startDate: calendarDateToDb(row.startDate),
          endDate: row.endDate == null ? null : calendarDateToDb(row.endDate),
          description: row.description,
          workshop: row.workshop,
          cost: row.cost,
          remark: row.remark,
          createdAt: row.at,
          updatedAt: row.at,
          createdBy: row.createdBy,
          updatedBy: row.createdBy,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw maintenanceAlreadyOpen();
      throw error;
    }
  }

  async updateMaintenance(
    db: Db,
    id: string,
    patch: Parameters<EquipmentStore["updateMaintenance"]>[2],
    by: string,
    at: Date,
  ) {
    await db.constructionSiteWorkEquipmentMaintenance.update({
      where: { id },
      data: {
        kind: patch.kind,
        startDate: calendarDateToDb(patch.startDate),
        endDate: patch.endDate == null ? null : calendarDateToDb(patch.endDate),
        description: patch.description,
        workshop: patch.workshop,
        cost: patch.cost,
        remark: patch.remark,
        updatedAt: at,
        updatedBy: by,
      },
    });
  }

  async tombstoneMaintenance(db: Db, id: string, by: string, at: Date) {
    await db.constructionSiteWorkEquipmentMaintenance.update({
      where: { id },
      data: tombstone(by, at),
    });
  }

  async lastSheetDate(db: Db, equipmentId: string, projectId: string) {
    const result = await db.constructionSiteWorkEquipmentUsageSheet.aggregate({
      where: { equipmentId, projectId, deletedAt: null },
      _max: { sheetDate: true },
    });
    const latest = result._max.sheetDate;
    return latest == null ? null : calendarDateFromDb(latest);
  }

  async liveSheetCount(db: Db, equipmentId: string) {
    return db.constructionSiteWorkEquipmentUsageSheet.count({
      where: { equipmentId, deletedAt: null },
    });
  }

  async list(db: Db, params: EquipmentListParams) {
    const where = listWhere(params);
    const after = params.after;
    const page: Prisma.ConstructionSiteWorkEquipmentWhereInput =
      after == null
        ? where
        : {
            AND: [
              where,
              {
                OR: [
                  { createdAt: { lt: after.createdAt } },
                  { createdAt: after.createdAt, id: { lt: after.id } },
                ],
              },
            ],
          };
    const [rows, total] = await Promise.all([
      db.constructionSiteWorkEquipment.findMany({
        where: page,
        include: OPEN_MAINTENANCE,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: params.limit + 1,
      }),
      db.constructionSiteWorkEquipment.count({ where }),
    ]);
    return {
      items: rows.slice(0, params.limit).map(toStored),
      hasMore: rows.length > params.limit,
      total,
    };
  }

  async everAt(db: Db, workspaceId: string, projectId: string) {
    const rows = await db.constructionSiteWorkEquipment.findMany({
      where: {
        workspaceId,
        deletedAt: null,
        movements: { some: { toProjectId: projectId } },
      },
      include: OPEN_MAINTENANCE,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    return rows.map(toStored);
  }

  async lifecycleFacts(db: Db, equipmentIds: readonly string[]) {
    const facts = new Map<string, EquipmentLifecycleFacts>();
    if (equipmentIds.length === 0) return facts;
    const ids = [...equipmentIds];
    const [movements, maintenance] = await Promise.all([
      db.constructionSiteWorkEquipmentMovement.findMany({
        where: { equipmentId: { in: ids } },
        select: {
          equipmentId: true,
          movementDate: true,
          toProjectId: true,
          createdAt: true,
        },
      }),
      db.constructionSiteWorkEquipmentMaintenance.findMany({
        where: { equipmentId: { in: ids }, deletedAt: null },
        select: { equipmentId: true, startDate: true, endDate: true },
      }),
    ]);
    const of = (id: string) => {
      let fact = facts.get(id);
      if (fact == null) {
        fact = { movements: [], maintenance: [] };
        facts.set(id, fact);
      }
      return fact;
    };
    for (const row of movements)
      of(row.equipmentId).movements.push({
        movementDate: calendarDateFromDb(row.movementDate),
        toProjectId: row.toProjectId,
        createdAt: row.createdAt,
      });
    for (const row of maintenance)
      of(row.equipmentId).maintenance.push({
        startDate: calendarDateFromDb(row.startDate),
        endDate: row.endDate == null ? null : calendarDateFromDb(row.endDate),
      });
    return facts;
  }

  async lastClosingReadings(
    db: Db,
    equipmentIds: readonly string[],
    on: CalendarDate,
  ) {
    const readings = new Map<
      string,
      { reading: string; sheetDate: CalendarDate }
    >();
    if (equipmentIds.length === 0) return readings;
    const rows = await db.$queryRaw<
      { equipmentId: string; reading: Prisma.Decimal; sheetDate: Date }[]
    >(Prisma.sql`
      SELECT DISTINCT ON (equipment_id)
        equipment_id::text AS "equipmentId",
        closing_reading AS reading,
        sheet_date AS "sheetDate"
      FROM construction_site_work.equipment_usage_sheets
      WHERE equipment_id = ANY(${[...equipmentIds]}::uuid[])
        AND deleted_at IS NULL
        AND closing_reading IS NOT NULL
        AND sheet_date <= ${calendarDateToDb(on)}::date
      ORDER BY equipment_id, sheet_date DESC, shift DESC, created_at DESC`);
    for (const row of rows)
      readings.set(row.equipmentId, {
        reading: new Prisma.Decimal(row.reading).toFixed(2),
        sheetDate: calendarDateFromDb(row.sheetDate),
      });
    return readings;
  }
}
