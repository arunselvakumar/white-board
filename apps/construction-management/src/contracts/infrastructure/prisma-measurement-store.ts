import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { storedLocationRef } from "@/src/shared-kernel/location-ref";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

import type {
  MeasurementStore,
  StoredMeasurementPhoto,
  StoredMeasurementRow,
  StoredMeasurementSheet,
} from "../application/measurement-ports";
import type { ContractsTx } from "../application/ports";
import { BOQ_QUANTITY_SCALE, quantityText } from "../domain/boq";
import { scaledDecimal } from "../domain/item-analysis";

type SheetRow = Prisma.ConstructionContractsMeasurementSheetGetPayload<object>;
type RowRow = Prisma.ConstructionContractsMeasurementRowGetPayload<object>;
type PhotoRow = Prisma.ConstructionContractsMeasurementPhotoGetPayload<object>;

type DecimalLike = { toString(): string };

function scaled(value: DecimalLike): bigint {
  return scaledDecimal(value.toString(), BOQ_QUANTITY_SCALE) ?? 0n;
}

function optionalScaled(value: DecimalLike | null): bigint | null {
  return value == null ? null : scaled(value);
}

function optionalText(value: bigint | null): string | null {
  return value == null ? null : quantityText(value);
}

function toSheet(row: SheetRow): StoredMeasurementSheet {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    side: row.side,
    workOrderId: row.workOrderId,
    measuredOn: calendarDateFromDb(row.measuredOn),
    status: row.status,
    title: row.title,
    remarks: row.remarks,
    submittedAt: row.submittedAt,
    submittedBy: row.submittedBy,
    checkedAt: row.checkedAt,
    checkedBy: row.checkedBy,
    partyName: row.partyName,
    partyRole: row.partyRole,
    jointOn: row.jointOn == null ? null : calendarDateFromDb(row.jointOn),
    returnReason: row.returnReason,
    reopenReason: row.reopenReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toRow(row: RowRow): StoredMeasurementRow {
  return {
    id: row.id,
    sheetId: row.sheetId,
    boqItemId: row.boqItemId,
    workOrderLineId: row.workOrderLineId,
    description: row.description,
    location: storedLocationRef(row.location),
    nos: optionalScaled(row.nos),
    length: optionalScaled(row.length),
    breadth: optionalScaled(row.breadth),
    depth: optionalScaled(row.depth),
    direct: row.direct,
    quantity: scaled(row.quantity),
    position: row.position,
    billId: row.billId,
  };
}

function toPhoto(row: PhotoRow): StoredMeasurementPhoto {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    sheetId: row.sheetId,
    fileKey: row.fileKey,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    thumbKey: row.thumbKey,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

/** The columns a sheet's header and life write. */
function sheetData(sheet: StoredMeasurementSheet) {
  return {
    measuredOn: calendarDateToDb(sheet.measuredOn),
    status: sheet.status,
    title: sheet.title,
    remarks: sheet.remarks,
    submittedAt: sheet.submittedAt,
    submittedBy: sheet.submittedBy,
    checkedAt: sheet.checkedAt,
    checkedBy: sheet.checkedBy,
    partyName: sheet.partyName,
    partyRole: sheet.partyRole,
    jointOn: sheet.jointOn == null ? null : calendarDateToDb(sheet.jointOn),
    returnReason: sheet.returnReason,
    reopenReason: sheet.reopenReason,
  };
}

/**
 * Measurement sheets, their rows and photos in `construction_contracts`
 * (CM-1105). Every method runs on the transaction or client it is given.
 * The lock is the BOQ's (`PrismaBoqStore.lock`).
 */
export class PrismaMeasurementStore implements MeasurementStore {
  async list(db: ContractsTx, params: Parameters<MeasurementStore["list"]>[1]) {
    const filters: Prisma.ConstructionContractsMeasurementSheetWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        deletedAt: null,
        ...(params.side == null ? {} : { side: params.side }),
        ...(params.workOrderId == null
          ? {}
          : { workOrderId: params.workOrderId }),
        ...(params.status == null ? {} : { status: params.status }),
        ...(params.from == null && params.to == null
          ? {}
          : {
              measuredOn: {
                ...(params.from == null
                  ? {}
                  : { gte: calendarDateToDb(params.from) }),
                ...(params.to == null
                  ? {}
                  : { lte: calendarDateToDb(params.to) }),
              },
            }),
      },
    ];
    const backwards = params.before != null;
    const cursor = params.after ?? params.before;
    const paged =
      cursor == null
        ? filters
        : [
            ...filters,
            {
              OR: backwards
                ? [
                    { measuredOn: { gt: calendarDateToDb(cursor.measuredOn) } },
                    {
                      measuredOn: calendarDateToDb(cursor.measuredOn),
                      id: { gt: cursor.id },
                    },
                  ]
                : [
                    { measuredOn: { lt: calendarDateToDb(cursor.measuredOn) } },
                    {
                      measuredOn: calendarDateToDb(cursor.measuredOn),
                      id: { lt: cursor.id },
                    },
                  ],
            },
          ];
    const direction = backwards ? ("asc" as const) : ("desc" as const);
    const [rows, total] = await Promise.all([
      db.constructionContractsMeasurementSheet.findMany({
        where: { AND: paged },
        orderBy: [{ measuredOn: direction }, { id: direction }],
        take: params.limit + 1,
      }),
      db.constructionContractsMeasurementSheet.count({
        where: { AND: filters },
      }),
    ]);
    const hasMore = rows.length > params.limit;
    const page = rows.slice(0, params.limit);
    if (backwards) page.reverse();
    return { items: page.map(toSheet), total, hasMore };
  }

  async find(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsMeasurementSheet.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toSheet(row);
  }

  async rows(
    db: ContractsTx,
    workspaceId: string,
    sheetIds: readonly string[],
  ) {
    if (sheetIds.length === 0) return [];
    const rows = await db.constructionContractsMeasurementRow.findMany({
      where: { workspaceId, sheetId: { in: [...new Set(sheetIds)] } },
      orderBy: [{ sheetId: "asc" }, { position: "asc" }, { id: "asc" }],
    });
    return rows.map(toRow);
  }

  async insert(tx: ContractsTx, sheet: StoredMeasurementSheet) {
    await tx.constructionContractsMeasurementSheet.create({
      data: {
        id: sheet.id,
        workspaceId: sheet.workspaceId,
        projectId: sheet.projectId,
        side: sheet.side,
        workOrderId: sheet.workOrderId,
        ...sheetData(sheet),
        createdAt: sheet.createdAt,
        updatedAt: sheet.updatedAt,
        createdBy: sheet.createdBy,
        updatedBy: sheet.updatedBy,
      },
    });
  }

  async update(
    tx: ContractsTx,
    after: StoredMeasurementSheet,
    expectedUpdatedAt: Date,
  ) {
    const updated = await tx.constructionContractsMeasurementSheet.updateMany({
      where: { id: after.id, deletedAt: null, updatedAt: expectedUpdatedAt },
      data: {
        ...sheetData(after),
        updatedAt: after.updatedAt,
        updatedBy: after.updatedBy,
      },
    });
    return updated.count > 0;
  }

  async replaceRows(
    tx: ContractsTx,
    workspaceId: string,
    sheetId: string,
    rows: readonly StoredMeasurementRow[],
  ) {
    await tx.constructionContractsMeasurementRow.deleteMany({
      where: { workspaceId, sheetId },
    });
    if (rows.length === 0) return;
    await tx.constructionContractsMeasurementRow.createMany({
      data: rows.map((row) => ({
        id: row.id,
        workspaceId,
        sheetId,
        boqItemId: row.boqItemId,
        workOrderLineId: row.workOrderLineId,
        description: row.description,
        locationType: row.location?.type ?? null,
        // No location is left out (SQL NULL): `next dev` turns
        // `Prisma.DbNull` into `{}`.
        ...(row.location == null
          ? {}
          : {
              location: JSON.parse(
                JSON.stringify(row.location),
              ) as Prisma.InputJsonValue,
            }),
        nos: optionalText(row.nos),
        length: optionalText(row.length),
        breadth: optionalText(row.breadth),
        depth: optionalText(row.depth),
        direct: row.direct,
        quantity: quantityText(row.quantity),
        position: row.position,
        billId: row.billId,
      })),
    });
  }

  async delete(
    tx: ContractsTx,
    input: Parameters<MeasurementStore["delete"]>[1],
  ) {
    const deleted = await tx.constructionContractsMeasurementSheet.updateMany({
      where: {
        id: input.sheet.id,
        deletedAt: null,
        ...(input.expectedUpdatedAt == null
          ? {}
          : { updatedAt: input.expectedUpdatedAt }),
      },
      data: {
        deletedAt: input.at,
        deletedBy: input.by,
        updatedAt: input.at,
        updatedBy: input.by,
      },
    });
    return deleted.count > 0;
  }

  async billedRows(db: ContractsTx, workspaceId: string, sheetId: string) {
    return db.constructionContractsMeasurementRow.count({
      where: { workspaceId, sheetId, billId: { not: null } },
    });
  }

  async measuredByItem(
    db: ContractsTx,
    input: Parameters<MeasurementStore["measuredByItem"]>[1],
  ) {
    const column =
      input.side === "client"
        ? Prisma.sql`r.boq_item_id`
        : Prisma.sql`r.work_order_line_id`;
    const rows = await db.$queryRaw<{ id: string; measured: string }[]>(
      Prisma.sql`SELECT ${column}::text AS id, SUM(r.quantity)::text AS measured
        FROM construction_contracts.measurement_rows r
        JOIN construction_contracts.measurement_sheets s ON s.id = r.sheet_id
        WHERE r.workspace_id = ${input.workspaceId}
          AND s.workspace_id = ${input.workspaceId}
          AND s.project_id = ${input.projectId}::uuid
          AND s.deleted_at IS NULL
          AND s.side = ${input.side}::construction_contracts.side
          AND s.status::text IN (${Prisma.join([...input.statuses])})
          AND ${column} IS NOT NULL
          ${input.exceptSheetId == null ? Prisma.empty : Prisma.sql`AND s.id <> ${input.exceptSheetId}::uuid`}
        GROUP BY ${column}`,
    );
    return new Map(
      rows.map((row) => [
        row.id,
        scaledDecimal(row.measured, BOQ_QUANTITY_SCALE) ?? 0n,
      ]),
    );
  }

  async photos(db: ContractsTx, workspaceId: string, sheetId: string) {
    const rows = await db.constructionContractsMeasurementPhoto.findMany({
      where: { workspaceId, sheetId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toPhoto);
  }

  async photoCounts(
    db: ContractsTx,
    workspaceId: string,
    sheetIds: readonly string[],
  ) {
    if (sheetIds.length === 0) return new Map<string, number>();
    const rows = await db.constructionContractsMeasurementPhoto.groupBy({
      by: ["sheetId"],
      where: { workspaceId, sheetId: { in: [...sheetIds] }, deletedAt: null },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.sheetId, row._count._all]));
  }

  async photoByKey(
    db: ContractsTx,
    workspaceId: string,
    sheetId: string,
    key: string,
  ) {
    const row = await db.constructionContractsMeasurementPhoto.findFirst({
      where: { workspaceId, sheetId, fileKey: key },
    });
    return row == null ? null : { ...toPhoto(row), deletedAt: row.deletedAt };
  }

  async insertPhoto(tx: ContractsTx, photo: StoredMeasurementPhoto) {
    await tx.constructionContractsMeasurementPhoto.create({
      data: {
        id: photo.id,
        workspaceId: photo.workspaceId,
        projectId: photo.projectId,
        sheetId: photo.sheetId,
        fileKey: photo.fileKey,
        fileName: photo.fileName,
        contentType: photo.contentType,
        bytes: photo.bytes,
        thumbKey: photo.thumbKey,
        createdAt: photo.createdAt,
        createdBy: photo.createdBy,
      },
    });
  }

  async removePhoto(
    tx: ContractsTx,
    input: Parameters<MeasurementStore["removePhoto"]>[1],
  ) {
    const removed = await tx.constructionContractsMeasurementPhoto.updateMany({
      where: { id: input.photo.id, deletedAt: null },
      data: { deletedAt: input.at, deletedBy: input.by },
    });
    return removed.count > 0;
  }

  names(db: ContractsTx, workspaceId: string, userIds: readonly string[]) {
    return userNamesInCompany(db, workspaceId, userIds);
  }
}
