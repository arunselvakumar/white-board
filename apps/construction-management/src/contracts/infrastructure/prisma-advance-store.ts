import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type {
  AdvanceStore,
  ContractRef,
  DueSoonItem,
  StoredAdvance,
  StoredGuarantee,
  StoredRelease,
} from "../application/advance-ports";
import type { ContractsTx } from "../application/ports";
import { addMonths } from "../domain/advance";
import {
  fixedDecimal,
  PERCENT_SCALE,
  scaledDecimal,
} from "../domain/item-analysis";

type AdvanceRow = Prisma.ConstructionContractsAdvanceGetPayload<object>;
type GuaranteeRow = Prisma.ConstructionContractsBankGuaranteeGetPayload<object>;
type ReleaseRow =
  Prisma.ConstructionContractsRetentionReleaseGetPayload<object>;

const date = (value: Date | null): CalendarDate | null =>
  value == null ? null : calendarDateFromDb(value);

function toAdvance(row: AdvanceRow): StoredAdvance {
  const text = row.recoveryValue.toFixed(4);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    direction: row.direction,
    kind: row.kind,
    workOrderId: row.workOrderId,
    clientId: row.clientId,
    amount: row.amount,
    advanceOn: calendarDateFromDb(row.advanceOn),
    recoveryMode: row.recoveryMode,
    recoveryValue:
      scaledDecimal(text, row.recoveryMode === "percent" ? PERCENT_SCALE : 0) ??
      0n,
    paymentId: row.paymentId,
    remarks: row.remarks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function advanceData(row: StoredAdvance) {
  return {
    kind: row.kind,
    amount: row.amount,
    advanceOn: calendarDateToDb(row.advanceOn),
    recoveryMode: row.recoveryMode,
    recoveryValue:
      row.recoveryMode === "percent"
        ? fixedDecimal(row.recoveryValue, PERCENT_SCALE)
        : row.recoveryValue.toString(),
    paymentId: row.paymentId,
    remarks: row.remarks,
  };
}

function toGuarantee(row: GuaranteeRow): StoredGuarantee {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    side: row.side,
    purpose: row.purpose,
    workOrderId: row.workOrderId,
    advanceId: row.advanceId,
    number: row.number,
    bank: row.bank,
    amount: row.amount,
    issuedOn: date(row.issuedOn),
    expiresOn: calendarDateFromDb(row.expiresOn),
    releasedOn: date(row.releasedOn),
    remarks: row.remarks,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function guaranteeData(row: StoredGuarantee) {
  return {
    purpose: row.purpose,
    advanceId: row.advanceId,
    number: row.number,
    bank: row.bank,
    amount: row.amount,
    issuedOn: row.issuedOn == null ? null : calendarDateToDb(row.issuedOn),
    expiresOn: calendarDateToDb(row.expiresOn),
    releasedOn:
      row.releasedOn == null ? null : calendarDateToDb(row.releasedOn),
    remarks: row.remarks,
  };
}

function toRelease(row: ReleaseRow): StoredRelease {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    side: row.side,
    workOrderId: row.workOrderId,
    clientId: row.clientId,
    stage: row.stage,
    amount: row.amount,
    releasedOn: calendarDateFromDb(row.releasedOn),
    reason: row.reason,
    bankGuaranteeId: row.bankGuaranteeId,
    invoiceId: row.invoiceId,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };
}

/** The rows of one side of a contract. */
function sideWhere(contract: ContractRef) {
  return contract.side === "contractor"
    ? { side: "contractor" as const, workOrderId: contract.workOrderId }
    : {
        side: "client" as const,
        projectId: contract.projectId,
        workOrderId: null,
      };
}

function advanceWhere(contract: ContractRef) {
  return contract.side === "contractor"
    ? { direction: "given" as const, workOrderId: contract.workOrderId }
    : { direction: "received" as const, projectId: contract.projectId };
}

/**
 * Advances, bank guarantees and retention releases in
 * `construction_contracts` (CM-1108). Every method runs on the transaction
 * or client it is given; the lock is the BOQ's (`PrismaBoqStore.lock`).
 */
export class PrismaAdvanceStore implements AdvanceStore {
  // Advances ------------------------------------------------------------------

  async advances(db: ContractsTx, workspaceId: string, contract: ContractRef) {
    const rows = await db.constructionContractsAdvance.findMany({
      where: {
        workspaceId,
        projectId: contract.projectId,
        deletedAt: null,
        ...advanceWhere(contract),
      },
      orderBy: [{ advanceOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toAdvance);
  }

  async findAdvance(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsAdvance.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toAdvance(row);
  }

  async insertAdvance(tx: ContractsTx, row: StoredAdvance) {
    await tx.constructionContractsAdvance.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        direction: row.direction,
        workOrderId: row.workOrderId,
        clientId: row.clientId,
        ...advanceData(row),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
      },
    });
  }

  async updateAdvance(
    tx: ContractsTx,
    row: StoredAdvance,
    expectedUpdatedAt: Date,
  ) {
    const updated = await tx.constructionContractsAdvance.updateMany({
      where: { id: row.id, deletedAt: null, updatedAt: expectedUpdatedAt },
      data: {
        ...advanceData(row),
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      },
    });
    return updated.count > 0;
  }

  async deleteAdvance(tx: ContractsTx, id: string, by: string, at: Date) {
    await tx.constructionContractsAdvance.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  }

  async recovered(
    db: ContractsTx,
    workspaceId: string,
    advanceIds: readonly string[],
    exceptBillId: string | null,
  ) {
    const ids = [...new Set(advanceIds)];
    if (ids.length === 0) return new Map<string, bigint>();
    const rows = await db.$queryRaw<{ advanceId: string; amount: bigint }[]>(
      Prisma.sql`SELECT d.advance_id::text AS "advanceId",
          COALESCE(SUM(d.amount), 0)::bigint AS amount
        FROM construction_contracts.bill_deductions d
        JOIN construction_contracts.bills b ON b.id = d.bill_id
        WHERE d.workspace_id = ${workspaceId} AND b.workspace_id = ${workspaceId}
          AND d.advance_id = ANY(${ids}::uuid[])
          AND d.kind IN ('mobilisation_recovery', 'secured_advance_recovery')
          AND b.deleted_at IS NULL AND b.status = 'approved'
          ${exceptBillId == null ? Prisma.empty : Prisma.sql`AND b.id <> ${exceptBillId}::uuid`}
        GROUP BY d.advance_id`,
    );
    return new Map(rows.map((row) => [row.advanceId, row.amount]));
  }

  async billsRecovering(
    db: ContractsTx,
    workspaceId: string,
    advanceId: string,
  ) {
    const rows = await db.$queryRaw<{ count: bigint }[]>(
      Prisma.sql`SELECT COUNT(DISTINCT b.id)::bigint AS count
        FROM construction_contracts.bill_deductions d
        JOIN construction_contracts.bills b ON b.id = d.bill_id
        WHERE d.workspace_id = ${workspaceId} AND d.advance_id = ${advanceId}::uuid
          AND b.deleted_at IS NULL AND b.status NOT IN ('rejected', 'reversed')`,
    );
    return Number(rows[0]?.count ?? 0n);
  }

  // Bank guarantees -----------------------------------------------------------

  async guarantees(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ) {
    const rows = await db.constructionContractsBankGuarantee.findMany({
      where: {
        workspaceId,
        projectId: contract.projectId,
        deletedAt: null,
        ...sideWhere(contract),
      },
      orderBy: [{ expiresOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toGuarantee);
  }

  async findGuarantee(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsBankGuarantee.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toGuarantee(row);
  }

  async insertGuarantee(tx: ContractsTx, row: StoredGuarantee) {
    await tx.constructionContractsBankGuarantee.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        side: row.side,
        workOrderId: row.workOrderId,
        ...guaranteeData(row),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        createdBy: row.createdBy,
        updatedBy: row.updatedBy,
      },
    });
  }

  async updateGuarantee(
    tx: ContractsTx,
    row: StoredGuarantee,
    expectedUpdatedAt: Date,
  ) {
    const updated = await tx.constructionContractsBankGuarantee.updateMany({
      where: { id: row.id, deletedAt: null, updatedAt: expectedUpdatedAt },
      data: {
        ...guaranteeData(row),
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      },
    });
    return updated.count > 0;
  }

  async deleteGuarantee(tx: ContractsTx, id: string, by: string, at: Date) {
    await tx.constructionContractsBankGuarantee.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by, updatedAt: at, updatedBy: by },
    });
  }

  async releasesAgainst(
    db: ContractsTx,
    workspaceId: string,
    guaranteeId: string,
  ) {
    return db.constructionContractsRetentionRelease.count({
      where: { workspaceId, bankGuaranteeId: guaranteeId, deletedAt: null },
    });
  }

  async guaranteesOfAdvance(
    db: ContractsTx,
    workspaceId: string,
    advanceId: string,
  ) {
    return db.constructionContractsBankGuarantee.count({
      where: { workspaceId, advanceId, deletedAt: null },
    });
  }

  // Retention -----------------------------------------------------------------

  async retentionDeducted(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ) {
    const scope =
      contract.side === "contractor"
        ? Prisma.sql`b.work_order_id = ${contract.workOrderId}::uuid AND b.side = 'contractor'`
        : Prisma.sql`b.project_id = ${contract.projectId}::uuid AND b.side = 'client'`;
    const rows = await db.$queryRaw<{ amount: bigint }[]>(
      Prisma.sql`SELECT COALESCE(SUM(d.amount), 0)::bigint AS amount
        FROM construction_contracts.bill_deductions d
        JOIN construction_contracts.bills b ON b.id = d.bill_id
        WHERE d.workspace_id = ${workspaceId} AND b.workspace_id = ${workspaceId}
          AND ${scope} AND b.type = 'running'
          AND b.deleted_at IS NULL AND b.status = 'approved'
          AND d.kind = 'retention'`,
    );
    return rows[0]?.amount ?? 0n;
  }

  async releases(db: ContractsTx, workspaceId: string, contract: ContractRef) {
    const rows = await db.constructionContractsRetentionRelease.findMany({
      where: {
        workspaceId,
        projectId: contract.projectId,
        deletedAt: null,
        ...sideWhere(contract),
      },
      orderBy: [{ releasedOn: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toRelease);
  }

  async releasedTotal(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ) {
    const found = await db.constructionContractsRetentionRelease.aggregate({
      where: {
        workspaceId,
        projectId: contract.projectId,
        deletedAt: null,
        ...sideWhere(contract),
      },
      _sum: { amount: true },
    });
    return found._sum.amount ?? 0n;
  }

  async releasedByContractor(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ) {
    const rows = await db.$queryRaw<{ contractorId: string; amount: bigint }[]>(
      Prisma.sql`SELECT w.contractor_id::text AS "contractorId",
          COALESCE(SUM(r.amount), 0)::bigint AS amount
        FROM construction_contracts.retention_releases r
        JOIN construction_contracts.work_orders w ON w.id = r.work_order_id
        WHERE r.workspace_id = ${workspaceId} AND r.project_id = ${projectId}::uuid
          AND r.side = 'contractor' AND r.deleted_at IS NULL
        GROUP BY w.contractor_id`,
    );
    return new Map(rows.map((row) => [row.contractorId, row.amount]));
  }

  async releaseCount(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ) {
    return db.constructionContractsRetentionRelease.count({
      where: {
        workspaceId,
        projectId: contract.projectId,
        ...sideWhere(contract),
      },
    });
  }

  async findRelease(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsRetentionRelease.findFirst({
      where: { id, workspaceId, deletedAt: null },
    });
    return row == null ? null : toRelease(row);
  }

  async insertRelease(tx: ContractsTx, row: StoredRelease) {
    await tx.constructionContractsRetentionRelease.create({
      data: {
        id: row.id,
        workspaceId: row.workspaceId,
        projectId: row.projectId,
        side: row.side,
        workOrderId: row.workOrderId,
        clientId: row.clientId,
        stage: row.stage,
        amount: row.amount,
        releasedOn: calendarDateToDb(row.releasedOn),
        reason: row.reason,
        bankGuaranteeId: row.bankGuaranteeId,
        invoiceId: row.invoiceId,
        createdAt: row.createdAt,
        createdBy: row.createdBy,
      },
    });
  }

  async deleteRelease(tx: ContractsTx, id: string, by: string, at: Date) {
    await tx.constructionContractsRetentionRelease.update({
      where: { id },
      data: { deletedAt: at, deletedBy: by },
    });
  }

  // The daily notice -------------------------------------------------------------

  async dueBetween(
    db: ContractsTx,
    range: { from: CalendarDate; to: CalendarDate },
  ): Promise<DueSoonItem[]> {
    const from = calendarDateToDb(range.from);
    const to = calendarDateToDb(range.to);
    const guarantees = await db.$queryRaw<
      {
        workspaceId: string;
        projectId: string;
        side: "contractor" | "client";
        workOrderId: string | null;
        number: string;
        bank: string;
        expiresOn: Date;
      }[]
    >(
      Prisma.sql`SELECT g.workspace_id AS "workspaceId", g.project_id::text AS "projectId",
          g.side::text AS side, g.work_order_id::text AS "workOrderId",
          g.number, g.bank, g.expires_on AS "expiresOn"
        FROM construction_contracts.bank_guarantees g
        LEFT JOIN construction_contracts.work_orders w ON w.id = g.work_order_id
        WHERE g.deleted_at IS NULL AND g.released_on IS NULL
          AND g.expires_on BETWEEN ${from} AND ${to}
          AND (g.work_order_id IS NULL
            OR (w.deleted_at IS NULL AND w.status <> 'cancelled'))
        ORDER BY g.expires_on, g.id`,
    );
    // A DLP ends at most 120 months after it starts: read the starts that
    // could end in the window, then work the end out exactly.
    const earliest = calendarDateToDb(addMonths(range.from, -121));
    const workOrders = await db.$queryRaw<
      {
        workspaceId: string;
        projectId: string;
        id: string;
        number: string | null;
        completedOn: Date;
        dlpMonths: number | null;
      }[]
    >(
      Prisma.sql`SELECT w.workspace_id AS "workspaceId", w.project_id::text AS "projectId",
          w.id::text AS id, w.number, w.completed_on AS "completedOn",
          w.dlp_months AS "dlpMonths"
        FROM construction_contracts.work_orders w
        WHERE w.deleted_at IS NULL AND w.status IN ('issued', 'closed')
          AND w.completed_on IS NOT NULL
          AND w.completed_on BETWEEN ${earliest} AND ${to}`,
    );
    const contracts = await db.$queryRaw<
      {
        workspaceId: string;
        projectId: string;
        handoverOn: Date;
        dlpMonths: number | null;
      }[]
    >(
      Prisma.sql`SELECT c.workspace_id AS "workspaceId", c.project_id::text AS "projectId",
          c.handover_on AS "handoverOn", c.dlp_months AS "dlpMonths"
        FROM construction_contracts.client_contracts c
        WHERE c.handover_on IS NOT NULL
          AND c.handover_on BETWEEN ${earliest} AND ${to}`,
    );
    const inWindow = (end: CalendarDate) =>
      end >= range.from && end <= range.to;
    const items: DueSoonItem[] = guarantees.map((row) => ({
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      side: row.side,
      kind: "guarantee",
      label: `${row.number} (${row.bank})`,
      workOrderId: row.workOrderId,
      date: calendarDateFromDb(row.expiresOn),
    }));
    for (const row of workOrders) {
      const end = addMonths(
        calendarDateFromDb(row.completedOn),
        row.dlpMonths ?? 0,
      );
      if (inWindow(end))
        items.push({
          workspaceId: row.workspaceId,
          projectId: row.projectId,
          side: "contractor",
          kind: "dlp",
          label: row.number ?? "Work Order",
          workOrderId: row.id,
          date: end,
        });
    }
    for (const row of contracts) {
      const end = addMonths(
        calendarDateFromDb(row.handoverOn),
        row.dlpMonths ?? 0,
      );
      if (inWindow(end))
        items.push({
          workspaceId: row.workspaceId,
          projectId: row.projectId,
          side: "client",
          kind: "dlp",
          label: "client contract",
          workOrderId: null,
          date: end,
        });
    }
    return items;
  }
}
