import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

import type { ContractsTx } from "../application/ports";
import type {
  StoredWorkOrder,
  StoredWorkOrderLine,
  StoredWorkOrderMaterial,
  StoredWorkOrderRevision,
  WorkOrderSnapshot,
  WorkOrderStore,
} from "../application/work-order-ports";
import { BOQ_QUANTITY_SCALE, quantityText } from "../domain/boq";
import {
  COEFFICIENT_SCALE,
  fixedDecimal,
  PERCENT_SCALE,
  scaledDecimal,
} from "../domain/item-analysis";
import { isTdsNature } from "../domain/work-order";

type WorkOrderRow = Prisma.ConstructionContractsWorkOrderGetPayload<object>;
type LineRow = Prisma.ConstructionContractsWorkOrderLineGetPayload<object>;

type DecimalLike = { toString(): string };

function scaled(value: DecimalLike, scale: number): bigint {
  return scaledDecimal(value.toString(), scale) ?? 0n;
}

function optionalScaled(value: DecimalLike | null, scale: number) {
  return value == null ? null : scaled(value, scale);
}

const percentText = (value: bigint) => fixedDecimal(value, PERCENT_SCALE);

function date(value: Date | null): string | null {
  return value == null ? null : calendarDateFromDb(value);
}

function toWorkOrder(row: WorkOrderRow): StoredWorkOrder {
  const nature = row.tdsNature;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    contractorId: row.contractorId,
    departmentId: row.departmentId,
    number: row.number,
    orderDate: calendarDateFromDb(row.orderDate),
    validUntil: date(row.validUntil),
    scope: row.scope,
    status: row.status,
    revision: row.revision,
    terms: {
      retentionPercent: scaled(row.retentionPercent, PERCENT_SCALE),
      retentionCapPercent: optionalScaled(
        row.retentionCapPercent,
        PERCENT_SCALE,
      ),
      retentionCompletionPercent: scaled(
        row.retentionCompletionPercent,
        PERCENT_SCALE,
      ),
      dlpMonths: row.dlpMonths,
      tdsNature: nature != null && isTdsNature(nature) ? nature : null,
      sacCode: row.sacCode,
      gstRate: optionalScaled(row.gstRate, PERCENT_SCALE),
      reverseCharge: row.reverseCharge,
      mobilisationAdvance: row.mobilisationAdvance,
      mobilisationRecoveryPercent: optionalScaled(
        row.mobilisationRecoveryPercent,
        PERCENT_SCALE,
      ),
    },
    completedOn: date(row.completedOn),
    decidedAt: row.decidedAt,
    decidedBy: row.decidedBy,
    rejectReason: row.rejectReason,
    closedOn: date(row.closedOn),
    closeReason: row.closeReason,
    cancelledOn: date(row.cancelledOn),
    cancelReason: row.cancelReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function toLine(row: LineRow): StoredWorkOrderLine {
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    kind: row.kind,
    boqItemId: row.boqItemId,
    itemNo: row.itemNo,
    description: row.description,
    uomId: row.uomId,
    sacHsn: row.sacHsn,
    quantity: scaled(row.quantity, BOQ_QUANTITY_SCALE),
    rate: row.rate,
    position: row.position,
  };
}

/** The columns the header writes. */
function workOrderData(workOrder: StoredWorkOrder) {
  const { terms } = workOrder;
  return {
    contractorId: workOrder.contractorId,
    departmentId: workOrder.departmentId,
    number: workOrder.number,
    orderDate: calendarDateToDb(workOrder.orderDate),
    validUntil:
      workOrder.validUntil == null
        ? null
        : calendarDateToDb(workOrder.validUntil),
    scope: workOrder.scope,
    status: workOrder.status,
    revision: workOrder.revision,
    retentionPercent: percentText(terms.retentionPercent),
    retentionCapPercent:
      terms.retentionCapPercent == null
        ? null
        : percentText(terms.retentionCapPercent),
    retentionCompletionPercent: percentText(terms.retentionCompletionPercent),
    dlpMonths: terms.dlpMonths,
    tdsNature: terms.tdsNature,
    sacCode: terms.sacCode,
    gstRate: terms.gstRate == null ? null : percentText(terms.gstRate),
    reverseCharge: terms.reverseCharge,
    mobilisationAdvance: terms.mobilisationAdvance,
    mobilisationRecoveryPercent:
      terms.mobilisationRecoveryPercent == null
        ? null
        : percentText(terms.mobilisationRecoveryPercent),
    completedOn:
      workOrder.completedOn == null
        ? null
        : calendarDateToDb(workOrder.completedOn),
    decidedAt: workOrder.decidedAt,
    decidedBy: workOrder.decidedBy,
    rejectReason: workOrder.rejectReason,
    closedOn:
      workOrder.closedOn == null ? null : calendarDateToDb(workOrder.closedOn),
    closeReason: workOrder.closeReason,
    cancelledOn:
      workOrder.cancelledOn == null
        ? null
        : calendarDateToDb(workOrder.cancelledOn),
    cancelReason: workOrder.cancelReason,
  };
}

function lineData(line: StoredWorkOrderLine) {
  return {
    kind: line.kind,
    boqItemId: line.boqItemId,
    itemNo: line.itemNo,
    description: line.description,
    uomId: line.uomId,
    sacHsn: line.sacHsn,
    quantity: quantityText(line.quantity),
    rate: line.rate,
    position: line.position,
  };
}

/**
 * Work Orders, their lines, materials and revisions in
 * `construction_contracts` (CM-1104). Every method runs on the transaction
 * or client it is given. The lock is the BOQ's (`PrismaBoqStore.lock`).
 */
export class PrismaWorkOrderStore implements WorkOrderStore {
  async list(db: ContractsTx, params: Parameters<WorkOrderStore["list"]>[1]) {
    const search = params.search?.trim() ?? "";
    const filters: Prisma.ConstructionContractsWorkOrderWhereInput[] = [
      {
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        deletedAt: null,
        ...(params.status == null ? {} : { status: params.status }),
        ...(params.contractorId == null
          ? {}
          : { contractorId: params.contractorId }),
        ...(search === ""
          ? {}
          : {
              OR: [
                { number: { contains: search, mode: "insensitive" } },
                { scope: { contains: search, mode: "insensitive" } },
              ],
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
                    { createdAt: { gt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { gt: cursor.id } },
                  ]
                : [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
            },
          ];
    const direction = backwards ? ("asc" as const) : ("desc" as const);
    const [rows, total] = await Promise.all([
      db.constructionContractsWorkOrder.findMany({
        where: { AND: paged },
        orderBy: [{ createdAt: direction }, { id: direction }],
        take: params.limit + 1,
      }),
      db.constructionContractsWorkOrder.count({ where: { AND: filters } }),
    ]);
    const hasMore = rows.length > params.limit;
    const page = rows.slice(0, params.limit);
    if (backwards) page.reverse();
    return { items: page.map(toWorkOrder), total, hasMore };
  }

  async find(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsWorkOrder.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toWorkOrder(row);
  }

  async lines(
    db: ContractsTx,
    workspaceId: string,
    workOrderIds: readonly string[],
  ) {
    if (workOrderIds.length === 0) return [];
    const rows = await db.constructionContractsWorkOrderLine.findMany({
      where: {
        workspaceId,
        workOrderId: { in: [...new Set(workOrderIds)] },
        deletedAt: null,
      },
      orderBy: [{ workOrderId: "asc" }, { position: "asc" }, { id: "asc" }],
    });
    return rows.map(toLine);
  }

  async materials(db: ContractsTx, workspaceId: string, workOrderId: string) {
    const rows = await db.constructionContractsWorkOrderMaterial.findMany({
      where: { workspaceId, workOrderId },
      include: { coefficients: true },
      orderBy: { id: "asc" },
    });
    return rows.map((row): StoredWorkOrderMaterial => ({
      id: row.id,
      workOrderId: row.workOrderId,
      materialId: row.materialId,
      issueBasis: row.issueBasis,
      issueRate: row.issueRate,
      wastagePercent: scaled(row.wastagePercent, PERCENT_SCALE),
      penalRate: row.penalRate,
      coefficients: row.coefficients.map((coefficient) => ({
        lineId: coefficient.workOrderLineId,
        coefficient: scaled(coefficient.coefficient, COEFFICIENT_SCALE),
      })),
    }));
  }

  async revisions(db: ContractsTx, workspaceId: string, workOrderId: string) {
    const rows = await db.constructionContractsWorkOrderRevision.findMany({
      where: { workspaceId, workOrderId },
      orderBy: { revision: "desc" },
    });
    return rows.map((row): StoredWorkOrderRevision => ({
      id: row.id,
      workOrderId: row.workOrderId,
      revision: row.revision,
      reason: row.reason,
      snapshot: row.snapshot as unknown as WorkOrderSnapshot,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
    }));
  }

  async insert(tx: ContractsTx, workOrder: StoredWorkOrder) {
    await tx.constructionContractsWorkOrder.create({
      data: {
        id: workOrder.id,
        workspaceId: workOrder.workspaceId,
        projectId: workOrder.projectId,
        ...workOrderData(workOrder),
        createdAt: workOrder.createdAt,
        updatedAt: workOrder.updatedAt,
        createdBy: workOrder.createdBy,
        updatedBy: workOrder.updatedBy,
      },
    });
  }

  async update(
    tx: ContractsTx,
    after: StoredWorkOrder,
    expectedUpdatedAt: Date,
  ) {
    const updated = await tx.constructionContractsWorkOrder.updateMany({
      where: { id: after.id, deletedAt: null, updatedAt: expectedUpdatedAt },
      data: {
        ...workOrderData(after),
        updatedAt: after.updatedAt,
        updatedBy: after.updatedBy,
      },
    });
    return updated.count > 0;
  }

  async saveLines(
    tx: ContractsTx,
    input: Parameters<WorkOrderStore["saveLines"]>[1],
  ) {
    const existing = await tx.constructionContractsWorkOrderLine.findMany({
      where: { workOrderId: input.workOrderId, deletedAt: null },
      select: { id: true },
    });
    const known = new Set(existing.map((row) => row.id));
    const keep = new Set(input.lines.map((line) => line.id));
    const removed = [...known].filter((id) => !keep.has(id));
    if (removed.length > 0)
      await tx.constructionContractsWorkOrderLine.updateMany({
        where: { id: { in: removed } },
        data: { deletedAt: input.at, deletedBy: input.by, updatedAt: input.at },
      });
    for (const line of input.lines.filter((row) => known.has(row.id)))
      await tx.constructionContractsWorkOrderLine.update({
        where: { id: line.id },
        data: { ...lineData(line), updatedAt: input.at },
      });
    const added = input.lines.filter((line) => !known.has(line.id));
    if (added.length > 0)
      await tx.constructionContractsWorkOrderLine.createMany({
        data: added.map((line) => ({
          id: line.id,
          workspaceId: input.workspaceId,
          workOrderId: input.workOrderId,
          ...lineData(line),
          createdAt: input.at,
          updatedAt: input.at,
        })),
      });
  }

  async replaceMaterials(
    tx: ContractsTx,
    workspaceId: string,
    workOrderId: string,
    materials: readonly StoredWorkOrderMaterial[],
  ) {
    await tx.constructionContractsWorkOrderMaterial.deleteMany({
      where: { workOrderId },
    });
    if (materials.length === 0) return;
    await tx.constructionContractsWorkOrderMaterial.createMany({
      data: materials.map((material) => ({
        id: material.id,
        workspaceId,
        workOrderId,
        materialId: material.materialId,
        issueBasis: material.issueBasis,
        issueRate: material.issueRate,
        wastagePercent: percentText(material.wastagePercent),
        penalRate: material.penalRate,
      })),
    });
    const coefficients = materials.flatMap((material) =>
      material.coefficients.map((coefficient) => ({
        workOrderMaterialId: material.id,
        workOrderLineId: coefficient.lineId,
        workspaceId,
        coefficient: fixedDecimal(coefficient.coefficient, COEFFICIENT_SCALE),
      })),
    );
    if (coefficients.length > 0)
      await tx.constructionContractsWorkOrderMaterialCoefficient.createMany({
        data: coefficients,
      });
  }

  async delete(
    tx: ContractsTx,
    input: Parameters<WorkOrderStore["delete"]>[1],
  ) {
    const deleted = await tx.constructionContractsWorkOrder.updateMany({
      where: {
        id: input.workOrder.id,
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

  async insertRevision(
    tx: ContractsTx,
    workspaceId: string,
    revision: StoredWorkOrderRevision,
  ) {
    await tx.constructionContractsWorkOrderRevision.create({
      data: {
        id: revision.id,
        workspaceId,
        workOrderId: revision.workOrderId,
        revision: revision.revision,
        reason: revision.reason,
        snapshot: revision.snapshot,
        createdAt: revision.createdAt,
        createdBy: revision.createdBy,
      },
    });
  }

  async orderedElsewhere(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    exceptId: string | null,
  ) {
    const rows = await db.$queryRaw<{ id: string; ordered: string }[]>(
      Prisma.sql`SELECT l.boq_item_id::text AS id, SUM(l.quantity)::text AS ordered
        FROM construction_contracts.work_order_lines l
        JOIN construction_contracts.work_orders w ON w.id = l.work_order_id
        WHERE l.workspace_id = ${workspaceId} AND w.workspace_id = ${workspaceId}
          AND w.project_id = ${projectId}::uuid
          AND w.deleted_at IS NULL AND w.status <> 'cancelled'
          AND l.deleted_at IS NULL AND l.boq_item_id IS NOT NULL
          AND (${exceptId}::uuid IS NULL OR w.id <> ${exceptId}::uuid)
        GROUP BY l.boq_item_id`,
    );
    return new Map(
      rows.map((row) => [row.id, scaled(row.ordered, BOQ_QUANTITY_SCALE)]),
    );
  }

  async billedByLine(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
  ) {
    const rows = await db.$queryRaw<{ id: string; billed: string }[]>(
      Prisma.sql`SELECT bl.work_order_line_id::text AS id, SUM(bl.quantity)::text AS billed
        FROM construction_contracts.bill_lines bl
        JOIN construction_contracts.bills b ON b.id = bl.bill_id
        WHERE bl.workspace_id = ${workspaceId} AND b.workspace_id = ${workspaceId}
          AND b.work_order_id = ${workOrderId}::uuid
          AND b.deleted_at IS NULL AND b.status = 'approved'
          AND bl.work_order_line_id IS NOT NULL
        GROUP BY bl.work_order_line_id`,
    );
    return new Map(
      rows.map((row) => [row.id, scaled(row.billed, BOQ_QUANTITY_SCALE)]),
    );
  }

  async openBills(db: ContractsTx, workspaceId: string, workOrderId: string) {
    return db.constructionContractsBill.count({
      where: {
        workspaceId,
        workOrderId,
        deletedAt: null,
        status: { in: ["draft", "pending_approval"] },
      },
    });
  }

  async analysisMaterials(
    db: ContractsTx,
    workspaceId: string,
    libraryItemIds: readonly string[],
  ) {
    const out = new Map<string, Map<string, bigint>>();
    if (libraryItemIds.length === 0) return out;
    const rows = await db.constructionContractsItemAnalysisLine.findMany({
      where: {
        workspaceId,
        itemId: { in: [...new Set(libraryItemIds)] },
        kind: "material",
        materialId: { not: null },
      },
      select: { itemId: true, materialId: true, coefficient: true },
    });
    for (const row of rows) {
      if (row.materialId == null) continue;
      const byMaterial = out.get(row.itemId) ?? new Map<string, bigint>();
      byMaterial.set(
        row.materialId,
        (byMaterial.get(row.materialId) ?? 0n) +
          scaled(row.coefficient, COEFFICIENT_SCALE),
      );
      out.set(row.itemId, byMaterial);
    }
    return out;
  }

  names(db: ContractsTx, workspaceId: string, userIds: readonly string[]) {
    return userNamesInCompany(db, workspaceId, userIds);
  }
}
