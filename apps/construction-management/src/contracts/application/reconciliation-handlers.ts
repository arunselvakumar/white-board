import { assertCan, can, type MemberAccess } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { notFound } from "@/src/shared-kernel/domain-error";

import type { BillStatus, DeductionKind } from "../domain/contract-terms";
import {
  attributeIssue,
  consumedQuantity,
  reconcileMaterial,
  type MaterialReconciliation,
  type MaterialRecoveryLimit,
  type ReconciledMaterialTerms,
} from "../domain/material-reconciliation";
import type { RaBillDeduction } from "../domain/ra-bill";
import { workOrderNotFound } from "../domain/work-order";
import type { BoqDb } from "./boq-ports";
import type { ContractRef } from "./advance-ports";
import type { ContractsDirectory, ContractsTx } from "./ports";
import type {
  ContractorIssue,
  MaterialIssues,
  ReconciliationBillRef,
  ReconciliationStore,
} from "./reconciliation-ports";
import {
  WORK_ORDER_MENU,
  type StoredWorkOrder,
  type WorkOrderStore,
} from "./work-order-ports";

/**
 * Material reconciliation (ADR CM-0023 §10, CM-1110): the statement per
 * Work Order per running bill, the recoveries it suggests on a bill, and
 * the 10CA quantities escalation asks for.
 *
 * **The point a statement is cumulative to** is a running bill B of the
 * Work Order: billed quantities are those of the approved running bills
 * before it (a lower ordinal; all approved ones when B is a draft) plus
 * B's own lines whatever its status, so the draft being prepared is the
 * "next bill" and its own statement suggests its recoveries. Issues count
 * up to B's **"measured up to"** (the date its work was measured to), not
 * its bill date, so material for work not yet measured is not held
 * against it. Without a bill the statement is to date: every approved
 * bill and every issue.
 */

export type ReconciliationDeps = {
  db: BoqDb;
  store: ReconciliationStore;
  workOrders: Pick<WorkOrderStore, "find" | "materials">;
  issues: MaterialIssues;
  directory: Pick<ContractsDirectory, "materials" | "contractors">;
};

export type ReconciliationPoint = {
  billId: string | null;
  ordinal: number | null;
  /** Issues on or before; null: all. */
  upTo: CalendarDate | null;
  /** The bill's own line quantities (ten-thousandths by Work Order line). */
  own: ReadonlyMap<string, bigint>;
};

export type ReconciledIssue = ContractorIssue & {
  how: "named" | "auto" | "unattributed";
};

export type ReconciledMaterial = MaterialReconciliation & {
  terms: ReconciledMaterialTerms;
  materialName: string;
  uomName: string;
};

export type WorkOrderReconciliation = {
  materials: ReconciledMaterial[];
  /** Issues counted towards the Work Order up to the point. */
  issues: ReconciledIssue[];
  /** Issues of its materials to its Contractor that no rule attributes. */
  unattributed: (ReconciledIssue & { candidates: number })[];
};

function addBilled(
  into: Map<string, bigint>,
  more: ReadonlyMap<string, bigint>,
): Map<string, bigint> {
  for (const [lineId, quantity] of more)
    into.set(lineId, (into.get(lineId) ?? 0n) + quantity);
  return into;
}

/** The approved running bills that come before the point. */
export function approvedBefore(
  bills: readonly ReconciliationBillRef[],
  point: { billId: string | null; ordinal: number | null },
): ReconciliationBillRef[] {
  return bills.filter(
    (bill) =>
      bill.status === "approved" &&
      bill.id !== point.billId &&
      (point.ordinal == null ||
        (bill.ordinal != null && bill.ordinal < point.ordinal)),
  );
}

/** The Work Order's statement at a point (no access check). */
export async function reconcileWorkOrder(
  deps: Omit<ReconciliationDeps, "db">,
  db: ContractsTx,
  workspaceId: string,
  workOrder: StoredWorkOrder,
  point: ReconciliationPoint,
): Promise<WorkOrderReconciliation> {
  const terms = await deps.workOrders.materials(db, workspaceId, workOrder.id);
  if (terms.length === 0)
    return { materials: [], issues: [], unattributed: [] };
  const materialIds = terms.map((row) => row.materialId);
  const query = {
    projectId: workOrder.projectId,
    contractorId: workOrder.contractorId,
    materialIds,
  };
  const [bills, issues, returns, candidates, facts] = await Promise.all([
    deps.store.runningBills(db, workspaceId, workOrder.id),
    deps.issues.issuesTo(db, workspaceId, query),
    deps.issues.returnsFrom(db, workspaceId, query),
    deps.store.candidates(
      db,
      workspaceId,
      workOrder.projectId,
      workOrder.contractorId,
    ),
    deps.directory.materials(db, workspaceId, materialIds),
  ]);
  const before = approvedBefore(bills, point).map((bill) => bill.id);
  const [billedBefore, deductions] = await Promise.all([
    deps.store.billedByLine(db, workspaceId, before),
    deps.store.materialDeductions(db, workspaceId, before),
  ]);
  const billed = addBilled(new Map(billedBefore), point.own);
  const within = (date: CalendarDate) =>
    point.upTo == null || date <= point.upTo;

  const counted: ReconciledIssue[] = [];
  const unattributed: WorkOrderReconciliation["unattributed"] = [];
  for (const issue of issues) {
    const attribution = attributeIssue(issue, candidates);
    if (attribution.how === "unattributed") {
      unattributed.push({
        ...issue,
        how: "unattributed",
        candidates: attribution.candidates.length,
      });
      continue;
    }
    if (attribution.workOrderId === workOrder.id && within(issue.date))
      counted.push({ ...issue, how: attribution.how });
  }
  const returned = new Map<string, bigint>();
  for (const row of returns) {
    const attribution = attributeIssue(row, candidates);
    if (attribution.workOrderId !== workOrder.id || !within(row.date)) continue;
    returned.set(
      row.materialId,
      (returned.get(row.materialId) ?? 0n) + row.quantity,
    );
  }
  const issued = new Map<string, bigint>();
  for (const row of counted)
    issued.set(
      row.materialId,
      (issued.get(row.materialId) ?? 0n) + row.quantity,
    );
  const sumOf = (kind: DeductionKind, materialId: string) =>
    deductions
      .filter((row) => row.kind === kind && row.materialId === materialId)
      .reduce((sum, row) => sum + row.amount, 0n);

  const materials = terms.map((row): ReconciledMaterial => {
    const material: ReconciledMaterialTerms = {
      materialId: row.materialId,
      issueBasis: row.issueBasis,
      issueRate: row.issueRate,
      wastagePercent: row.wastagePercent,
      penalRate: row.penalRate,
      coefficients: row.coefficients,
    };
    const fact = facts.get(row.materialId);
    return {
      ...reconcileMaterial({
        material,
        billed,
        issued: issued.get(row.materialId) ?? 0n,
        returned: returned.get(row.materialId) ?? 0n,
        recoveredBefore: sumOf("material_reconciliation", row.materialId),
        atCostDeductedBefore: sumOf("material_at_cost", row.materialId),
      }),
      terms: material,
      materialName: fact?.name ?? "Material",
      uomName: fact?.uomName ?? "",
    };
  });
  return { materials, issues: counted, unattributed };
}

/** What a bill may recover per material, from its statement. */
export function recoveryLimits(
  reconciliation: WorkOrderReconciliation,
): MaterialRecoveryLimit[] {
  return reconciliation.materials.map((row) => ({
    materialId: row.materialId,
    materialName: row.materialName,
    issueBasis: row.terms.issueBasis,
    recoverySuggested: row.recoverySuggested,
  }));
}

/**
 * The material deductions a running draft suggests (CM-1110), each naming
 * its material, in the Work Order's material order: the reconciliation
 * recovery (excess × penal rate less what earlier approved bills
 * recovered), then material issued at cost (its value less what earlier
 * approved bills deducted). All together at most `room`.
 */
export function suggestedMaterialDeductions<K extends DeductionKind>(
  reconciliation: WorkOrderReconciliation,
  room: bigint,
): RaBillDeduction<K>[] {
  let left = room > 0n ? room : 0n;
  const out: RaBillDeduction<K>[] = [];
  const take = (kind: DeductionKind, materialId: string, want: bigint) => {
    const amount = want < left ? want : left;
    if (amount <= 0n) return;
    left -= amount;
    out.push({
      kind: kind as K,
      amount,
      description: null,
      advanceId: null,
      escalationBillId: null,
      materialId,
    });
  };
  for (const row of reconciliation.materials)
    take("material_reconciliation", row.materialId, row.recoverySuggested);
  for (const row of reconciliation.materials)
    take("material_at_cost", row.materialId, row.atCostSuggested);
  return out;
}

// ---------------------------------------------------------------------------
// The statement page
// ---------------------------------------------------------------------------

export type StatementBill = ReconciliationBillRef;

export type StatementMaterial = ReconciledMaterial & {
  /** On the bill itself: its recovery and at-cost deductions, if any. */
  onThisBill: bigint | null;
  atCostOnThisBill: bigint | null;
  /** The reason typed on a recovery above its suggestion. */
  reason: string | null;
};

export type ReconciliationStatement = {
  workOrder: {
    id: string;
    number: string | null;
    projectId: string;
    contractorId: string;
    contractorName: string;
    status: StoredWorkOrder["status"];
  };
  /** The bill the statement is cumulative to; null: to date. */
  bill: StatementBill | null;
  /** Running bills to pick from (not rejected or reversed), newest first. */
  bills: StatementBill[];
  materials: StatementMaterial[];
  issues: ReconciledIssue[];
  unattributed: WorkOrderReconciliation["unattributed"];
  /** False: procurement records no returns yet (`MaterialIssues.returnsFrom`). */
  returnsRecorded: boolean;
  financial: boolean;
};

const PICKABLE: readonly BillStatus[] = [
  "draft",
  "pending_approval",
  "approved",
];

export class ReconciliationHandlers {
  constructor(private readonly deps: ReconciliationDeps) {}

  /**
   * A Work Order's statement (Work Order Read) at one of its running bills,
   * by default the latest approved one (else the open one; else to date).
   * 404 `BILL_NOT_FOUND` for a bill that is not a live running bill of it.
   */
  async statement(
    access: MemberAccess,
    workOrderId: string,
    billId: string | null,
  ): Promise<ReconciliationStatement> {
    const { db, store, workOrders, directory } = this.deps;
    const ws = access.workspaceId;
    const workOrder = await workOrders.find(db, ws, workOrderId);
    if (workOrder == null) throw workOrderNotFound();
    assertCan(access, WORK_ORDER_MENU, "read", {
      projectId: workOrder.projectId,
    });
    const bills = (await store.runningBills(db, ws, workOrder.id)).filter(
      (bill) => PICKABLE.includes(bill.status),
    );
    const latestApproved = [...bills]
      .reverse()
      .find((bill) => bill.status === "approved");
    const open = bills.find((bill) => bill.status !== "approved");
    const bill =
      billId == null
        ? (latestApproved ?? open ?? null)
        : (bills.find((row) => row.id === billId) ?? null);
    if (billId != null && bill == null)
      throw notFound("BILL_NOT_FOUND", "This bill was not found.");
    const own =
      bill == null
        ? new Map<string, bigint>()
        : await store.billedByLine(db, ws, [bill.id]);
    const [reconciliation, contractors, onBill] = await Promise.all([
      reconcileWorkOrder(this.deps, db, ws, workOrder, {
        billId: bill?.id ?? null,
        ordinal: bill?.ordinal ?? null,
        upTo: bill?.measuredUpTo ?? null,
        own,
      }),
      directory.contractors(db, ws, workOrder.projectId, [
        workOrder.contractorId,
      ]),
      bill == null
        ? Promise.resolve([])
        : store.materialDeductions(db, ws, [bill.id]),
    ]);
    const onThis = (kind: DeductionKind, materialId: string) => {
      const rows = onBill.filter(
        (row) => row.kind === kind && row.materialId === materialId,
      );
      return rows.length === 0
        ? null
        : rows.reduce((sum, row) => sum + row.amount, 0n);
    };
    return {
      workOrder: {
        id: workOrder.id,
        number: workOrder.number,
        projectId: workOrder.projectId,
        contractorId: workOrder.contractorId,
        contractorName:
          contractors.get(workOrder.contractorId)?.name ?? "Contractor",
        status: workOrder.status,
      },
      bill,
      bills: [...bills].reverse(),
      materials: reconciliation.materials.map((row) => ({
        ...row,
        onThisBill: onThis("material_reconciliation", row.materialId),
        atCostOnThisBill: onThis("material_at_cost", row.materialId),
        reason:
          onBill.find(
            (deduction) =>
              deduction.kind === "material_reconciliation" &&
              deduction.materialId === row.materialId,
          )?.description ?? null,
      })),
      issues: reconciliation.issues,
      unattributed: reconciliation.unattributed,
      returnsRecorded: false,
      financial: can(access, WORK_ORDER_MENU, "financial", {
        projectId: workOrder.projectId,
      }),
    };
  }

  /**
   * The 10CA hook (CM-1109's `EscalationDeps.materialQuantities`): per
   * quantity-basis component naming a Material the Work Order issues, the
   * theoretical quantity consumed by work billed in the period — Σ over
   * the Work Order's approved running bills dated in it of each line's
   * quantity × its coefficient, in ten-thousandths of the material's UoM.
   * The client side issues no material and answers nothing.
   */
  async periodQuantities(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
    period: { from: CalendarDate; to: CalendarDate },
    components: readonly { component: string; materialId: string | null }[],
  ): Promise<Map<string, bigint>> {
    const out = new Map<string, bigint>();
    if (contract.side !== "contractor") return out;
    const linked = components.filter((row) => row.materialId != null);
    if (linked.length === 0) return out;
    const [terms, billed] = await Promise.all([
      this.deps.workOrders.materials(db, workspaceId, contract.workOrderId),
      this.deps.store.billedInPeriod(
        db,
        workspaceId,
        contract.workOrderId,
        period,
      ),
    ]);
    for (const row of linked) {
      const material = terms.find((term) => term.materialId === row.materialId);
      if (material == null) continue;
      out.set(row.component, consumedQuantity(material.coefficients, billed));
    }
    return out;
  }
}
