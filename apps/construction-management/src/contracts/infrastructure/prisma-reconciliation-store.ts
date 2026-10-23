import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
} from "@/src/shared-kernel/calendar-date";

import type { ContractsTx } from "../application/ports";
import type {
  MaterialDeductionRow,
  ReconciliationBillRef,
  ReconciliationStore,
} from "../application/reconciliation-ports";
import type { BillStatus } from "../domain/contract-terms";
import { scaled } from "./prisma-ra-bill-rows";

/** Material reconciliation's reads over the contracts tables (CM-1110). */
export class PrismaReconciliationStore implements ReconciliationStore {
  async runningBills(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
  ): Promise<ReconciliationBillRef[]> {
    const rows = await db.constructionContractsBill.findMany({
      where: {
        workspaceId,
        workOrderId,
        side: "contractor",
        type: "running",
        deletedAt: null,
      },
      select: {
        id: true,
        number: true,
        ordinal: true,
        status: true,
        billDate: true,
        measuredUpTo: true,
        createdAt: true,
      },
      orderBy: [{ billDate: "asc" }, { createdAt: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      ordinal: row.ordinal,
      status: row.status as BillStatus,
      billDate: calendarDateFromDb(row.billDate),
      measuredUpTo: calendarDateFromDb(row.measuredUpTo ?? row.billDate),
    }));
  }

  async billedByLine(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ): Promise<Map<string, bigint>> {
    if (billIds.length === 0) return new Map();
    const rows = await db.constructionContractsBillLine.groupBy({
      by: ["workOrderLineId"],
      where: {
        workspaceId,
        billId: { in: [...billIds] },
        workOrderLineId: { not: null },
      },
      _sum: { quantity: true },
    });
    return new Map(
      rows.flatMap((row) =>
        row.workOrderLineId == null || row._sum.quantity == null
          ? []
          : [[row.workOrderLineId, scaled(row._sum.quantity)] as const],
      ),
    );
  }

  async materialDeductions(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ): Promise<MaterialDeductionRow[]> {
    if (billIds.length === 0) return [];
    const rows = await db.constructionContractsBillDeduction.findMany({
      where: {
        workspaceId,
        billId: { in: [...billIds] },
        materialId: { not: null },
      },
      select: {
        billId: true,
        kind: true,
        materialId: true,
        amount: true,
        description: true,
      },
      orderBy: [{ billId: "asc" }, { position: "asc" }],
    });
    return rows.flatMap((row) =>
      row.materialId == null ? [] : [{ ...row, materialId: row.materialId }],
    );
  }

  async candidates(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    contractorId: string,
  ) {
    const rows = await db.constructionContractsWorkOrder.findMany({
      where: {
        workspaceId,
        projectId,
        contractorId,
        deletedAt: null,
        status: { in: ["issued", "closed"] },
      },
      select: {
        id: true,
        status: true,
        orderDate: true,
        closedOn: true,
        materials: { select: { materialId: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      orderDate: calendarDateFromDb(row.orderDate),
      closedOn: row.closedOn == null ? null : calendarDateFromDb(row.closedOn),
      materialIds: new Set(
        row.materials.map((material) => material.materialId),
      ),
    }));
  }

  async billedInPeriod(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
    period: { from: string; to: string },
  ): Promise<Map<string, bigint>> {
    const rows = await db.$queryRaw<{ id: string; billed: string }[]>(
      Prisma.sql`SELECT bl.work_order_line_id::text AS id, SUM(bl.quantity)::text AS billed
        FROM construction_contracts.bill_lines bl
        JOIN construction_contracts.bills b ON b.id = bl.bill_id
        WHERE bl.workspace_id = ${workspaceId} AND b.workspace_id = ${workspaceId}
          AND b.work_order_id = ${workOrderId}::uuid
          AND b.side = 'contractor' AND b.type = 'running'
          AND b.deleted_at IS NULL AND b.status = 'approved'
          AND b.bill_date >= ${calendarDateToDb(period.from)}
          AND b.bill_date <= ${calendarDateToDb(period.to)}
          AND bl.work_order_line_id IS NOT NULL
        GROUP BY bl.work_order_line_id`,
    );
    return new Map(rows.map((row) => [row.id, scaled(row.billed)]));
  }
}
