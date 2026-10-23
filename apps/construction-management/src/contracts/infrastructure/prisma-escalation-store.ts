import { Prisma } from "@repo/construction-db";

import {
  calendarDateFromDb,
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";
import { userNamesInCompany } from "@/src/shared-kernel/user-names";

import type { ContractRef } from "../application/advance-ports";
import type {
  EscalationBillRef,
  EscalationBillStore,
  EscalationClauseStore,
  PriceIndexStore,
  StoredEscalationBill,
  StoredEscalationClause,
  StoredPriceIndex,
} from "../application/escalation-ports";
import type { ContractsTx } from "../application/ports";
import type { EscalationComponent } from "../domain/contract-terms";
import { billNumberTaken } from "../domain/contractor-bill";
import {
  escalationClauseExists,
  INDEX_SCALE,
  priceIndexExists,
  type EscalationBasis,
  type EscalationWorking,
} from "../domain/escalation";
import {
  fixedDecimal,
  PERCENT_SCALE,
  scaledDecimal,
} from "../domain/item-analysis";
import {
  billColumns,
  billCore,
  deductionRows,
  replaceDeductions,
  tombstoneBill,
  uniqueRefusal,
  updateBill,
} from "./prisma-ra-bill-rows";

type IndexRow = Prisma.ConstructionContractsPriceIndexGetPayload<object>;
type ClauseRow = Prisma.ConstructionContractsEscalationClauseGetPayload<{
  include: { components: true };
}>;
type BillRow = Prisma.ConstructionContractsBillGetPayload<object>;

const dec = (value: { toString(): string }, scale: number): bigint =>
  scaledDecimal(value.toString(), scale) ?? 0n;

// ---------------------------------------------------------------------------
// Price indices
// ---------------------------------------------------------------------------

function toIndex(row: IndexRow): StoredPriceIndex {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    series: row.series,
    month: calendarDateFromDb(row.month),
    value: dec(row.value, INDEX_SCALE),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

function indexData(row: StoredPriceIndex) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    series: row.series,
    month: calendarDateToDb(row.month),
    value: fixedDecimal(row.value, INDEX_SCALE),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

/** The Company's price indices (CM-1109): a plain table, deleted outright. */
export class PrismaPriceIndexStore implements PriceIndexStore {
  async list(db: ContractsTx, workspaceId: string, limit: number) {
    const rows = await db.constructionContractsPriceIndex.findMany({
      where: { workspaceId },
      orderBy: [{ series: "asc" }, { month: "asc" }],
      take: limit,
    });
    return rows.map(toIndex);
  }

  async find(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsPriceIndex.findFirst({
      where: { id, workspaceId },
    });
    return row == null ? null : toIndex(row);
  }

  async seriesNames(db: ContractsTx, workspaceId: string) {
    const rows = await db.constructionContractsPriceIndex.findMany({
      where: { workspaceId },
      distinct: ["series"],
      select: { series: true },
      orderBy: { series: "asc" },
    });
    return rows.map((row) => row.series);
  }

  async inMonths(
    db: ContractsTx,
    workspaceId: string,
    months: readonly CalendarDate[],
  ) {
    if (months.length === 0) return [];
    const rows = await db.constructionContractsPriceIndex.findMany({
      where: {
        workspaceId,
        month: { in: [...new Set(months)].map(calendarDateToDb) },
      },
    });
    return rows.map(toIndex);
  }

  async insert(tx: ContractsTx, row: StoredPriceIndex) {
    try {
      await tx.constructionContractsPriceIndex.create({ data: indexData(row) });
    } catch (error) {
      if (isUniqueViolation(error))
        throw priceIndexExists(row.series, row.month);
      throw error;
    }
  }

  async update(
    tx: ContractsTx,
    row: StoredPriceIndex,
    expectedUpdatedAt: Date | null,
  ) {
    const result = await tx.constructionContractsPriceIndex.updateMany({
      where: {
        id: row.id,
        workspaceId: row.workspaceId,
        ...(expectedUpdatedAt == null ? {} : { updatedAt: expectedUpdatedAt }),
      },
      data: {
        value: fixedDecimal(row.value, INDEX_SCALE),
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      },
    });
    return result.count === 1;
  }

  async delete(tx: ContractsTx, workspaceId: string, id: string) {
    const result = await tx.constructionContractsPriceIndex.deleteMany({
      where: { id, workspaceId },
    });
    return result.count === 1;
  }

  async insertMany(tx: ContractsTx, rows: readonly StoredPriceIndex[]) {
    if (rows.length === 0) return;
    try {
      await tx.constructionContractsPriceIndex.createMany({
        data: rows.map(indexData),
      });
    } catch (error) {
      const first = rows[0];
      if (isUniqueViolation(error) && first != null)
        throw priceIndexExists(first.series, first.month);
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Clauses
// ---------------------------------------------------------------------------

function clauseWhere(contract: ContractRef) {
  return contract.side === "contractor"
    ? { side: "contractor" as const, workOrderId: contract.workOrderId }
    : {
        side: "client" as const,
        projectId: contract.projectId,
        workOrderId: null,
      };
}

function toClause(row: ClauseRow): StoredEscalationClause {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    side: row.side,
    workOrderId: row.workOrderId,
    terms: {
      baseMonth: calendarDateFromDb(row.baseMonth),
      nonEscalablePercent: dec(row.nonEscalablePercent, PERCENT_SCALE),
      components: row.components
        .map((component) => ({
          component: component.component,
          basis: component.basis,
          weightPercent: dec(component.weightPercent, PERCENT_SCALE),
          series: component.series,
          basePrice: component.basePrice,
          materialId: component.materialId,
        }))
        .sort(
          (a, b) => ORDER.indexOf(a.component) - ORDER.indexOf(b.component),
        ),
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
  };
}

const ORDER: EscalationComponent[] = [
  "labour",
  "material",
  "cement",
  "steel",
  "bitumen",
  "pol",
  "other",
];

function componentRows(clause: StoredEscalationClause) {
  return clause.terms.components.map((row) => ({
    id: newId(clause.updatedAt.getTime()),
    workspaceId: clause.workspaceId,
    clauseId: clause.id,
    component: row.component,
    basis: row.basis,
    weightPercent: fixedDecimal(row.weightPercent, PERCENT_SCALE),
    series: row.series,
    basePrice: row.basePrice,
    materialId: row.materialId,
  }));
}

/** Escalation clauses and their components (CM-1109). */
export class PrismaEscalationClauseStore implements EscalationClauseStore {
  async forContract(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ) {
    const row = await db.constructionContractsEscalationClause.findFirst({
      where: { workspaceId, deletedAt: null, ...clauseWhere(contract) },
      include: { components: true },
    });
    return row == null ? null : toClause(row);
  }

  async find(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsEscalationClause.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: { components: true },
    });
    return row == null ? null : toClause(row);
  }

  async insert(tx: ContractsTx, clause: StoredEscalationClause) {
    try {
      await tx.constructionContractsEscalationClause.create({
        data: {
          id: clause.id,
          workspaceId: clause.workspaceId,
          projectId: clause.projectId,
          side: clause.side,
          workOrderId: clause.workOrderId,
          baseMonth: calendarDateToDb(clause.terms.baseMonth),
          nonEscalablePercent: fixedDecimal(
            clause.terms.nonEscalablePercent,
            PERCENT_SCALE,
          ),
          createdAt: clause.createdAt,
          updatedAt: clause.updatedAt,
          createdBy: clause.createdBy,
          updatedBy: clause.updatedBy,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw escalationClauseExists();
      throw error;
    }
    await tx.constructionContractsEscalationClauseComponent.createMany({
      data: componentRows(clause),
    });
  }

  async update(
    tx: ContractsTx,
    clause: StoredEscalationClause,
    expectedUpdatedAt: Date,
  ) {
    const result = await tx.constructionContractsEscalationClause.updateMany({
      where: {
        id: clause.id,
        workspaceId: clause.workspaceId,
        deletedAt: null,
        updatedAt: expectedUpdatedAt,
      },
      data: {
        baseMonth: calendarDateToDb(clause.terms.baseMonth),
        nonEscalablePercent: fixedDecimal(
          clause.terms.nonEscalablePercent,
          PERCENT_SCALE,
        ),
        updatedAt: clause.updatedAt,
        updatedBy: clause.updatedBy,
      },
    });
    if (result.count !== 1) return false;
    await tx.constructionContractsEscalationClauseComponent.deleteMany({
      where: { workspaceId: clause.workspaceId, clauseId: clause.id },
    });
    await tx.constructionContractsEscalationClauseComponent.createMany({
      data: componentRows(clause),
    });
    return true;
  }

  async delete(
    tx: ContractsTx,
    input: Parameters<EscalationClauseStore["delete"]>[1],
  ) {
    const result = await tx.constructionContractsEscalationClause.updateMany({
      where: {
        id: input.clause.id,
        workspaceId: input.clause.workspaceId,
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
    return result.count === 1;
  }
}

// ---------------------------------------------------------------------------
// The working as JSON
// ---------------------------------------------------------------------------

type WorkingJson = {
  version: 1;
  clauseId: string;
  valueOfWork: string;
  bills: {
    id: string;
    number: string | null;
    billDate: string;
    gross: string;
  }[];
  quantityValue: string;
  escalableValue: string;
  nonEscalablePercent: string;
  baseMonth: string;
  months: string[];
  components: {
    component: EscalationComponent;
    basis: EscalationBasis;
    weightPercent: string | null;
    series: string;
    baseIndex: string;
    indices: { month: string; value: string }[];
    averageIndex: string;
    factor: string;
    quantity: string | null;
    basePrice: string | null;
    amount: string;
  }[];
  gross: string;
};

const str = (value: bigint | null): string | null =>
  value == null ? null : value.toString();
const big = (value: string | null): bigint | null =>
  value == null ? null : BigInt(value);

/** Bigints as decimal strings, so the JSON keeps them exact. */
export function workingToJson(working: EscalationWorking): WorkingJson {
  return {
    version: 1,
    clauseId: working.clauseId,
    valueOfWork: working.valueOfWork.toString(),
    bills: working.bills.map((bill) => ({
      id: bill.id,
      number: bill.number,
      billDate: bill.billDate,
      gross: bill.gross.toString(),
    })),
    quantityValue: working.quantityValue.toString(),
    escalableValue: working.escalableValue.toString(),
    nonEscalablePercent: working.nonEscalablePercent.toString(),
    baseMonth: working.baseMonth,
    months: working.months,
    components: working.components.map((row) => ({
      component: row.component,
      basis: row.basis,
      weightPercent: str(row.weightPercent),
      series: row.series,
      baseIndex: row.baseIndex.toString(),
      indices: row.indices.map((item) => ({
        month: item.month,
        value: item.value.toString(),
      })),
      averageIndex: row.averageIndex.toString(),
      factor: row.factor,
      quantity: str(row.quantity),
      basePrice: str(row.basePrice),
      amount: row.amount.toString(),
    })),
    gross: working.gross.toString(),
  };
}

export function workingFromJson(raw: unknown): EscalationWorking {
  const json = raw as WorkingJson;
  return {
    clauseId: json.clauseId,
    valueOfWork: BigInt(json.valueOfWork),
    bills: json.bills.map((bill) => ({
      id: bill.id,
      number: bill.number,
      billDate: bill.billDate,
      gross: BigInt(bill.gross),
    })),
    quantityValue: BigInt(json.quantityValue),
    escalableValue: BigInt(json.escalableValue),
    nonEscalablePercent: BigInt(json.nonEscalablePercent),
    baseMonth: json.baseMonth,
    months: json.months,
    components: json.components.map((row) => ({
      component: row.component,
      basis: row.basis,
      weightPercent: big(row.weightPercent),
      series: row.series,
      baseIndex: BigInt(row.baseIndex),
      indices: row.indices.map((item) => ({
        month: item.month,
        value: BigInt(item.value),
      })),
      averageIndex: BigInt(row.averageIndex),
      factor: row.factor,
      quantity: big(row.quantity),
      basePrice: big(row.basePrice),
      amount: BigInt(row.amount),
    })),
    gross: BigInt(json.gross),
  };
}

// ---------------------------------------------------------------------------
// Escalation bills
// ---------------------------------------------------------------------------

const REFUSALS = { numberTaken: billNumberTaken, openExists: billNumberTaken };

function billScope(contract: ContractRef) {
  return contract.side === "contractor"
    ? { side: "contractor" as const, workOrderId: contract.workOrderId }
    : { side: "client" as const, projectId: contract.projectId };
}

function toEscalationBill(row: BillRow): StoredEscalationBill {
  const core = billCore(row);
  const working = workingFromJson(row.working);
  return {
    ...core,
    side: row.side,
    workOrderId: row.workOrderId,
    clientId: row.clientId,
    recipientGstin: row.recipientGstin,
    periodFrom: core.periodFrom ?? working.months[0] ?? core.billDate,
    periodTo: core.periodTo ?? core.billDate,
    working,
  };
}

function toRef(row: BillRow): EscalationBillRef {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    periodFrom: calendarDateFromDb(row.periodFrom ?? row.billDate),
    periodTo: calendarDateFromDb(row.periodTo ?? row.billDate),
    gross: row.gross,
  };
}

/** Escalation bills on the shared `bills` table (CM-1109). */
export class PrismaEscalationBillStore implements EscalationBillStore {
  async find(db: ContractsTx, workspaceId: string, id: string) {
    const row = await db.constructionContractsBill.findFirst({
      where: { id, workspaceId, type: "escalation", deletedAt: null },
    });
    return row == null ? null : toEscalationBill(row);
  }

  async ofContract(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ) {
    const rows = await db.constructionContractsBill.findMany({
      where: {
        workspaceId,
        type: "escalation",
        deletedAt: null,
        ...billScope(contract),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map(toRef);
  }

  async runningBillsIn(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
    period: { from: CalendarDate; to: CalendarDate },
  ) {
    const rows = await db.constructionContractsBill.findMany({
      where: {
        workspaceId,
        type: "running",
        status: "approved",
        deletedAt: null,
        ...billScope(contract),
        billDate: {
          gte: calendarDateToDb(period.from),
          lte: calendarDateToDb(period.to),
        },
      },
      orderBy: [{ billDate: "asc" }, { ordinal: "asc" }, { id: "asc" }],
      select: { id: true, number: true, billDate: true, gross: true },
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      billDate: calendarDateFromDb(row.billDate),
      gross: row.gross,
    }));
  }

  async takingBill(db: ContractsTx, workspaceId: string, billId: string) {
    const ids = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT b.id::text AS id FROM construction_contracts.bills b
        WHERE b.workspace_id = ${workspaceId} AND b.type = 'escalation'
          AND b.deleted_at IS NULL AND b.status NOT IN ('rejected', 'reversed')
          AND b.working -> 'bills' @> jsonb_build_array(jsonb_build_object('id', ${billId}::text))`,
    );
    if (ids.length === 0) return [];
    const rows = await db.constructionContractsBill.findMany({
      where: { id: { in: ids.map((row) => row.id) }, workspaceId },
    });
    return rows.map(toRef);
  }

  async insert(tx: ContractsTx, bill: StoredEscalationBill) {
    try {
      await tx.constructionContractsBill.create({
        data: {
          id: bill.id,
          workspaceId: bill.workspaceId,
          projectId: bill.projectId,
          side: bill.side,
          type: "escalation",
          workOrderId: bill.workOrderId,
          clientId: bill.clientId,
          recipientGstin: bill.recipientGstin,
          ...this.escalationColumns(bill),
          ...billColumns({ ...bill, measuredUpTo: bill.periodTo }),
          createdAt: bill.createdAt,
          createdBy: bill.createdBy,
        },
      });
    } catch (error) {
      throw uniqueRefusal(error, REFUSALS) ?? error;
    }
  }

  private escalationColumns(bill: StoredEscalationBill) {
    return {
      periodFrom: calendarDateToDb(bill.periodFrom),
      periodTo: calendarDateToDb(bill.periodTo),
      working: workingToJson(bill.working) as unknown as Prisma.InputJsonValue,
    };
  }

  update(
    tx: ContractsTx,
    after: StoredEscalationBill,
    expectedUpdatedAt: Date,
  ) {
    return updateBill(
      tx,
      { ...after, measuredUpTo: after.periodTo },
      expectedUpdatedAt,
      {
        clientId: after.clientId,
        recipientGstin: after.recipientGstin,
        ...this.escalationColumns(after),
      },
      REFUSALS,
    );
  }

  deductions(db: ContractsTx, workspaceId: string, billIds: readonly string[]) {
    return deductionRows(db, workspaceId, billIds);
  }

  replaceDeductions(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    deductions: Parameters<EscalationBillStore["replaceDeductions"]>[3],
  ) {
    return replaceDeductions(tx, workspaceId, billId, deductions);
  }

  delete(tx: ContractsTx, input: Parameters<EscalationBillStore["delete"]>[1]) {
    return tombstoneBill(tx, input);
  }

  async maxOrdinal(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ) {
    const found = await db.constructionContractsBill.aggregate({
      where: {
        workspaceId,
        type: "escalation",
        deletedAt: null,
        status: { notIn: ["rejected", "reversed"] },
        ...billScope(contract),
      },
      _max: { ordinal: true },
    });
    return found._max.ordinal ?? 0;
  }

  laterApproved(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
    bill: { id: string; ordinal: number | null },
  ) {
    return db.constructionContractsBill.count({
      where: {
        workspaceId,
        type: "escalation",
        deletedAt: null,
        status: "approved",
        id: { not: bill.id },
        ordinal: { gt: bill.ordinal ?? 0 },
        ...billScope(contract),
      },
    });
  }

  approvedCount(db: ContractsTx, workspaceId: string, contract: ContractRef) {
    return db.constructionContractsBill.count({
      where: {
        workspaceId,
        type: "escalation",
        deletedAt: null,
        status: "approved",
        ...billScope(contract),
      },
    });
  }

  async recoveredByEscalation(
    db: ContractsTx,
    workspaceId: string,
    escalationBillIds: readonly string[],
    exceptBillId: string | null,
  ) {
    const out = new Map<
      string,
      { live: bigint; approved: bigint; count: number }
    >();
    const ids = [...new Set(escalationBillIds)];
    if (ids.length === 0) return out;
    const rows = await db.$queryRaw<
      { id: string; live: bigint; approved: bigint; count: number }[]
    >(
      Prisma.sql`SELECT d.escalation_bill_id::text AS id,
          COALESCE(SUM(d.amount), 0)::bigint AS live,
          COALESCE(SUM(d.amount) FILTER (WHERE b.status = 'approved'), 0)::bigint AS approved,
          COUNT(*)::int AS count
        FROM construction_contracts.bill_deductions d
        JOIN construction_contracts.bills b ON b.id = d.bill_id
        WHERE d.workspace_id = ${workspaceId} AND b.workspace_id = ${workspaceId}
          AND d.escalation_bill_id = ANY(${ids}::uuid[])
          AND b.deleted_at IS NULL
          AND b.status IN ('draft', 'pending_approval', 'approved')
          ${exceptBillId == null ? Prisma.empty : Prisma.sql`AND b.id <> ${exceptBillId}::uuid`}
        GROUP BY d.escalation_bill_id`,
    );
    for (const row of rows)
      out.set(row.id, {
        live: row.live,
        approved: row.approved,
        count: row.count,
      });
    return out;
  }

  names(db: ContractsTx, workspaceId: string, userIds: readonly string[]) {
    return userNamesInCompany(db, workspaceId, userIds);
  }
}
