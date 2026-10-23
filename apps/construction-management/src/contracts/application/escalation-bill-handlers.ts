import {
  assertCan,
  can,
  menuByKey,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { approve, pendingState, reject } from "@/src/shared-kernel/approval";
import { recordAudit } from "@/src/shared-kernel/audit";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { boqAmount } from "../domain/boq";
import {
  CLIENT_BILL_NAMING,
  clientBillGst,
  clientBillNotFound,
  clientRetentionSuggestion,
  DEFAULT_CLIENT_CONTRACT_TERMS,
  GSTIN_NOT_IN_STATE,
  gstinNotInStateMessage,
  projectClientRequired,
  projectNotContractWork,
  projectStateRequired,
  supplierForProject,
} from "../domain/client-bill";
import { contractsProjectNotFound } from "../domain/contracts-errors";
import {
  ESCALATION_COMPONENT_LABELS,
  type EscalationComponent,
} from "../domain/contract-terms";
import {
  billNotLatest,
  billSettled,
  billWorkOrderInvalid,
  CONTRACTOR_BILL_NAMING,
  retentionSuggestion,
} from "../domain/contractor-bill";
import {
  ESCALATION_DEDUCTION_KINDS,
  escalationClauseRequired,
  escalationGrossZero,
  escalationNoBills,
  escalationPeriod,
  escalationPeriodOverlap,
  escalationQuantity,
  escalationRecovered,
  escalationWorking,
  escalationWorkingChanged,
  periodsOverlap,
  sameSeries,
  workingSignature,
  type EscalationPeriod,
  type EscalationWorking,
} from "../domain/escalation";
import {
  assertBillAction,
  assertRaDeductions,
  billChanged,
  billGst,
  billNet,
  deductionsTotal,
  raBillDeductions,
  raBillHeader,
  reverseReason,
  storedBillGst,
  type BillDeductionInput,
  type BillGst,
  type RaBillDeduction,
  type RetentionSuggestion,
} from "../domain/ra-bill";
import { workOrderValue } from "../domain/work-order";
import type { ContractRef } from "./advance-ports";
import { CLIENT_BILL_MENU } from "./client-bill-ports";
import { CONTRACTOR_BILL_MENU } from "./contractor-bill-ports";
import type { StoredBillDeduction } from "./contractor-bill-ports";
import { contractOf } from "./escalation-clause-handlers";
import {
  ESCALATION_DOCUMENT_TYPES,
  type EscalationDeps,
  type StoredEscalationBill,
  type StoredEscalationClause,
} from "./escalation-ports";
import type { ContractsProjectFacts, ContractsTx } from "./ports";
import {
  assertNotStale,
  dispatchBillApproval,
  pendingApproval,
  plannedDeductions,
  raBillSnapshot,
  uniqueIds,
} from "./ra-bill-common";
import type { StoredWorkOrder } from "./work-order-ports";

/**
 * Escalation bills (CM-1109, ADR CM-0023 §9): a third bill type on the
 * shared RA bill engine, on both sides. A draft covers whole months; its
 * value of work R is the gross of the side's approved, unreversed running
 * bills dated in the period, and its gross the 10CC / 10CA working
 * (`domain/escalation.ts`). GST is at the side's RA terms (the Work
 * Order's, or the client contract's as a tax invoice); retention as on
 * RA bills, the cap counting both types; no advance recoveries. Numbers
 * come from the side's bill sequence, ordinals per type. Approval,
 * rejection, reversal and the finance invoice work as on RA bills. A
 * negative bill (indices fell) is approved without an invoice and
 * recovered on the next running bills (`escalation-recoveries.ts`).
 */

const SIDES = {
  contractor: {
    menu: CONTRACTOR_BILL_MENU,
    module: "contractor_bill",
    naming: CONTRACTOR_BILL_NAMING,
    contract: "Work Order",
  },
  client: {
    menu: CLIENT_BILL_MENU,
    module: "client_bill",
    naming: CLIENT_BILL_NAMING,
    contract: "client contract",
  },
} as const;

type Side = keyof typeof SIDES;

export type EscalationBillCommand = {
  billDate: string;
  fromMonth: string;
  toMonth: string;
  remarks?: string | null;
  /** 10CA components: the quantity used in the period. Left out: kept. */
  quantities?:
    readonly { component: string; quantity: string | number }[] | null;
  /** Ignored without Financial. Left out: kept (a new draft holds the suggested retention). */
  deductions?: readonly BillDeductionInput[] | null;
};

export type CreateEscalationBillCommand = EscalationBillCommand & {
  projectId: string;
  /** Contractor side; none means the client contract. */
  workOrderId?: string | null;
};

export type EscalationBillAllowed = {
  edit: boolean;
  refresh: boolean;
  delete: boolean;
  submit: boolean;
  approve: boolean;
  reject: boolean;
  reverse: boolean;
  print: boolean;
};

export type EscalationWarning = { code: string; message: string };

export type EscalationBillDetail = {
  bill: StoredEscalationBill;
  projectName: string;
  partyId: string;
  partyName: string;
  workOrder: {
    id: string;
    number: string | null;
    orderDate: CalendarDate;
  } | null;
  supplyType: BillGst["supplyType"];
  payableGst: bigint;
  deductions: StoredBillDeduction[];
  retentionPercent: bigint;
  retentionCapPercent: bigint | null;
  retention: RetentionSuggestion;
  /** A negative approved bill: what is recovered on running bills and what is left. */
  recovery: { amount: bigint; recovered: bigint; outstanding: bigint } | null;
  warnings: EscalationWarning[];
  allowed: EscalationBillAllowed;
  createdByName: string | null;
  submittedByName: string | null;
  decidedByName: string | null;
  reversedByName: string | null;
  financial: boolean;
  viewerFlags: Flag[];
};

export type EscalationBillPrint = EscalationBillDetail & {
  project: ContractsProjectFacts;
};

export type EscalationPreview = {
  period: EscalationPeriod;
  working: EscalationWorking;
};

export type EscalationFormOptions = {
  side: Side;
  /** Contractor side: issued or closed Work Orders with their clause. */
  workOrders: {
    id: string;
    number: string | null;
    contractorName: string;
    baseMonth: CalendarDate | null;
    quantityComponents: EscalationComponent[];
  }[];
  /** Client side: the client contract's clause. */
  clientClause: {
    baseMonth: CalendarDate;
    quantityComponents: EscalationComponent[];
  } | null;
  today: CalendarDate;
};

/** What a contract bills with: its party, GST and retention terms. */
type ContractTerms = {
  contract: ContractRef;
  project: ContractsProjectFacts;
  workOrder: StoredWorkOrder | null;
  clause: StoredEscalationClause | null;
  partyId: string;
  partyName: string;
  departmentId: string | null;
  sacCode: string | null;
  gstRate: bigint | null;
  reverseCharge: boolean;
  supplierGstin: string | null;
  recipientGstin: string | null;
  clientId: string | null;
  warnings: EscalationWarning[];
  retentionPercent: bigint;
  retentionCapPercent: bigint | null;
  gst: (gross: bigint) => BillGst;
  retention: (gross: bigint, heldBefore: bigint) => RetentionSuggestion;
  heldBefore: (db: ContractsTx, exceptBillId: string | null) => Promise<bigint>;
};

type Deduction = RaBillDeduction<(typeof ESCALATION_DEDUCTION_KINDS)[number]>;

export function contractOfBill(bill: {
  projectId: string;
  workOrderId: string | null;
}): ContractRef {
  return contractOf(bill);
}

function snapshot(bill: StoredEscalationBill) {
  return raBillSnapshot(
    { ...bill, measuredUpTo: bill.periodTo },
    {
      type: "escalation",
      side: bill.side,
      workOrderId: bill.workOrderId,
      clientId: bill.clientId,
      periodFrom: bill.periodFrom,
      periodTo: bill.periodTo,
      valueOfWork: Number(bill.working.valueOfWork),
      bills: bill.working.bills.map((row) => row.id),
    },
  );
}

const sideOf = (contract: ContractRef): Side => contract.side;

export class EscalationBillHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: EscalationDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // Loading -------------------------------------------------------------------

  async find(workspaceId: string, id: string): Promise<StoredEscalationBill> {
    const found = await this.deps.bills.find(this.deps.db, workspaceId, id);
    if (found == null) throw clientBillNotFound();
    return found;
  }

  menuOf(bill: { side: Side }): (typeof SIDES)[Side]["menu"] {
    return SIDES[bill.side].menu;
  }

  viewerFlags(access: MemberAccess, side: Side, projectId: string): Flag[] {
    const menu = SIDES[side].menu;
    const supported = fromMask(menuByKey(menu)?.supported ?? 0);
    return supported.filter((flag) => can(access, menu, flag, { projectId }));
  }

  private financial(access: MemberAccess, side: Side, projectId: string) {
    return can(access, SIDES[side].menu, "financial", { projectId });
  }

  private draftEditor(
    access: MemberAccess,
    bill: StoredEscalationBill,
    flag: "update" | "delete",
  ): boolean {
    const menu = SIDES[bill.side].menu;
    const scope = { projectId: bill.projectId };
    return (
      (bill.createdBy === access.userId &&
        can(access, menu, "create", scope)) ||
      can(access, menu, flag, scope)
    );
  }

  private assertDraftEditor(
    access: MemberAccess,
    bill: StoredEscalationBill,
    flag: "update" | "delete",
  ): void {
    if (!this.draftEditor(access, bill, flag))
      assertCan(access, SIDES[bill.side].menu, flag, {
        projectId: bill.projectId,
      });
  }

  private allowed(
    access: MemberAccess,
    bill: StoredEscalationBill,
  ): EscalationBillAllowed {
    const menu = SIDES[bill.side].menu;
    const scope = { projectId: bill.projectId };
    const draft = bill.status === "draft";
    const pending = bill.status === "pending_approval";
    const editor = draft && this.draftEditor(access, bill, "update");
    return {
      edit: editor,
      refresh: editor,
      submit: editor,
      delete: draft && this.draftEditor(access, bill, "delete"),
      approve: pending && can(access, menu, "approve", scope),
      reject: pending && can(access, menu, "reject", scope),
      reverse:
        bill.status === "approved" && can(access, menu, "approve", scope),
      print: can(access, menu, "print", scope),
    };
  }

  private async project(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<ContractsProjectFacts> {
    const project = await this.deps.directory.project(
      db,
      workspaceId,
      projectId,
    );
    if (project == null) throw contractsProjectNotFound();
    return project;
  }

  /**
   * The contract's party and terms. Contractor side: a Work Order of the
   * Project that is issued or closed (400 `BILL_WORK_ORDER_INVALID`).
   * Client side: a Contract work Project with a Client and a state (400
   * `PROJECT_NOT_CONTRACT_WORK`, `PROJECT_CLIENT_REQUIRED`,
   * `PROJECT_STATE_REQUIRED`).
   */
  private async terms(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<ContractTerms> {
    const { directory, workOrders, clauses } = this.deps;
    const project = await this.project(db, workspaceId, contract.projectId);
    const clause = await clauses.forContract(db, workspaceId, contract);
    if (contract.side === "contractor") {
      const workOrder = await workOrders.find(
        db,
        workspaceId,
        contract.workOrderId,
      );
      if (
        workOrder?.projectId !== contract.projectId ||
        (workOrder.status !== "issued" && workOrder.status !== "closed")
      )
        throw billWorkOrderInvalid();
      const [contractors, lines] = await Promise.all([
        directory.contractors(db, workspaceId, project.id, [
          workOrder.contractorId,
        ]),
        workOrders.lines(db, workspaceId, [workOrder.id]),
      ]);
      const contractor = contractors.get(workOrder.contractorId) ?? null;
      const value = workOrderValue(lines);
      const terms = workOrder.terms;
      return {
        contract,
        project,
        workOrder,
        clause,
        partyId: workOrder.contractorId,
        partyName: contractor?.name ?? "",
        departmentId: workOrder.departmentId,
        sacCode: terms.sacCode,
        gstRate: terms.gstRate,
        reverseCharge: terms.reverseCharge,
        supplierGstin: contractor?.gstin ?? null,
        recipientGstin: null,
        clientId: null,
        warnings: [],
        retentionPercent: terms.retentionPercent,
        retentionCapPercent: terms.retentionCapPercent,
        gst: (gross) =>
          billGst({
            gross,
            gstRate: terms.gstRate,
            reverseCharge: terms.reverseCharge,
            supplierStateCode: contractor?.stateCode ?? null,
            placeOfSupplyStateCode: project.stateCode,
          }),
        retention: (gross, heldBefore) =>
          retentionSuggestion({
            gross,
            retentionPercent: terms.retentionPercent,
            retentionCapPercent: terms.retentionCapPercent,
            workOrderValue: value,
            heldBefore,
          }),
        heldBefore: (tx, except) =>
          this.deps.contractorBills.retentionHeld(
            tx,
            workspaceId,
            workOrder.id,
            except,
          ),
      };
    }
    if (project.role !== "contract") throw projectNotContractWork();
    if (project.clientId == null) throw projectClientRequired();
    const stateCode = project.stateCode;
    if (stateCode == null || stateCode === "") throw projectStateRequired();
    const clientId = project.clientId;
    const [stored, addresses, clients, items] = await Promise.all([
      this.deps.clientBills.contract(db, workspaceId, project.id),
      directory.billingAddresses(db, workspaceId),
      directory.clients(db, workspaceId, [clientId]),
      this.deps.boq.items(db, workspaceId, project.id),
    ]);
    const terms = stored?.terms ?? DEFAULT_CLIENT_CONTRACT_TERMS;
    const supplier = supplierForProject(addresses, stateCode);
    const client = clients.get(clientId) ?? null;
    const boqValue = items.reduce(
      (sum, item) => sum + boqAmount(item.quantity, item.rate),
      0n,
    );
    return {
      contract,
      project,
      workOrder: null,
      clause,
      partyId: clientId,
      partyName: client?.name ?? project.clientName ?? "",
      departmentId: null,
      sacCode: terms.sacCode,
      gstRate: terms.gstRate,
      reverseCharge: false,
      supplierGstin: supplier.gstin,
      recipientGstin: client?.gstin ?? null,
      clientId,
      warnings:
        supplier.warning == null
          ? []
          : [
              {
                code: GSTIN_NOT_IN_STATE,
                message: gstinNotInStateMessage(stateCode, supplier.gstin),
              },
            ],
      retentionPercent: terms.retentionPercent,
      retentionCapPercent: terms.retentionCapPercent,
      gst: (gross) =>
        clientBillGst({
          gross,
          gstRate: terms.gstRate,
          supplierStateCode: supplier.stateCode,
          placeOfSupplyStateCode: stateCode,
        }),
      retention: (gross, heldBefore) =>
        clientRetentionSuggestion({
          gross,
          retentionPercent: terms.retentionPercent,
          retentionCapPercent: terms.retentionCapPercent,
          boqValue,
          heldBefore,
        }),
      heldBefore: (tx, except) =>
        this.deps.clientBills.retentionHeld(
          tx,
          workspaceId,
          project.id,
          except,
        ),
    };
  }

  // Figures -------------------------------------------------------------------

  /** The typed 10CA quantities (400 `ESCALATION_QUANTITY_INVALID`). */
  private quantities(
    clause: StoredEscalationClause,
    typed: EscalationBillCommand["quantities"],
    stored: EscalationWorking | null,
  ): Map<EscalationComponent, bigint> | null {
    if (typed == null)
      return stored == null
        ? null
        : new Map(
            stored.components.flatMap((row) =>
              row.quantity == null ? [] : [[row.component, row.quantity]],
            ),
          );
    const allowed = clause.terms.components
      .filter((row) => row.basis === "quantity")
      .map((row) => row.component as string);
    const out = new Map<EscalationComponent, bigint>();
    typed.forEach((row, index) => {
      if (!allowed.includes(row.component))
        throw escalationQuantityNotOnClause(index);
      out.set(
        row.component as EscalationComponent,
        escalationQuantity(row.quantity, index),
      );
    });
    return out;
  }

  /**
   * The working over the period: R's bills (400 `ESCALATION_NO_BILLS`
   * when none), the indices (400 `PRICE_INDEX_MISSING`) and the 10CA
   * quantities — typed ones first, then the CM-1110 hook's.
   */
  private async work(
    db: ContractsTx,
    workspaceId: string,
    terms: ContractTerms,
    period: EscalationPeriod,
    typed: Map<EscalationComponent, bigint> | null,
  ): Promise<EscalationWorking> {
    const clause = terms.clause;
    if (clause == null) throw escalationClauseRequired();
    const [bills, indices, reconciled] = await Promise.all([
      this.deps.bills.runningBillsIn(db, workspaceId, terms.contract, period),
      this.deps.indices.inMonths(db, workspaceId, [
        clause.terms.baseMonth,
        ...period.months,
      ]),
      this.deps.materialQuantities(db, {
        workspaceId,
        contract: terms.contract,
        period,
      }),
    ]);
    if (bills.length === 0) throw escalationNoBills();
    const quantities = new Map(reconciled);
    for (const [component, quantity] of typed ?? [])
      quantities.set(component, quantity);
    return escalationWorking({
      clauseId: clause.id,
      clause: clause.terms,
      bills,
      months: period.months,
      index: (series, month) =>
        indices.find(
          (row) => row.month === month && sameSeries(row.series, series),
        )?.value ?? null,
      quantities,
    });
  }

  private period(
    terms: ContractTerms,
    input: { fromMonth: string; toMonth: string },
    billDate: CalendarDate,
  ): EscalationPeriod {
    if (terms.clause == null) throw escalationClauseRequired();
    return escalationPeriod(input, {
      baseMonth: terms.clause.terms.baseMonth,
      billDate,
    });
  }

  /** 409 `ESCALATION_PERIOD_OVERLAP` against approved or pending escalation bills. */
  private async assertNoOverlap(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
    period: { from: CalendarDate; to: CalendarDate },
    exceptId: string | null,
  ): Promise<void> {
    const others = await this.deps.bills.ofContract(db, workspaceId, contract);
    const clash = others.find(
      (other) =>
        other.id !== exceptId &&
        (other.status === "approved" || other.status === "pending_approval") &&
        periodsOverlap(period, { from: other.periodFrom, to: other.periodTo }),
    );
    if (clash != null)
      throw escalationPeriodOverlap({
        number: clash.number,
        from: clash.periodFrom,
        to: clash.periodTo,
      });
  }

  /** GST, retention and the deductions by plan, checked; the net. */
  private async price(
    db: ContractsTx,
    terms: ContractTerms,
    billId: string,
    gross: bigint,
    plan:
      | { kind: "suggest" }
      | { kind: "given"; inputs: readonly BillDeductionInput[] }
      | {
          kind: "keep";
          stored: readonly StoredBillDeduction[];
          previousGross: bigint;
        },
  ) {
    const heldBefore = await terms.heldBefore(db, billId);
    const gst = terms.gst(gross);
    const suggestionFor = (amount: bigint) =>
      terms.retention(amount, heldBefore);
    const retention = suggestionFor(gross);
    const deductions: Deduction[] = plannedDeductions(
      plan,
      retention,
      suggestionFor,
      (inputs) =>
        raBillDeductions(
          inputs,
          ESCALATION_DEDUCTION_KINDS,
          "An escalation bill takes retention or other deductions; advances are recovered on running bills.",
        ).map((row) => ({ ...row, escalationBillId: null, materialId: null })),
    );
    assertRaDeductions({
      deductions,
      gross,
      payableGst: gst.payable,
      retentionMax: retention.suggested,
      contract: SIDES[sideOf(terms.contract)].contract,
    });
    return {
      gst,
      retention,
      deductions,
      net: billNet({
        gross,
        payableGst: gst.payable,
        deductionsTotal: deductionsTotal(deductions),
      }),
    };
  }

  private figures(
    terms: ContractTerms,
    working: EscalationWorking,
    period: EscalationPeriod,
    priced: Awaited<ReturnType<EscalationBillHandlers["price"]>>,
  ) {
    return {
      periodFrom: period.from,
      periodTo: period.to,
      working,
      cumulativeValue: 0n,
      previousValue: 0n,
      gross: working.gross,
      sacCode: terms.sacCode,
      gstRate: terms.gstRate,
      placeOfSupplyStateCode: terms.project.stateCode,
      supplierGstin: terms.supplierGstin,
      recipientGstin: terms.recipientGstin,
      clientId: terms.clientId,
      reverseCharge: priced.gst.reverseCharge,
      cgst: priced.gst.cgst,
      sgst: priced.gst.sgst,
      igst: priced.gst.igst,
      deductionsTotal: deductionsTotal(priced.deductions),
      net: priced.net,
    };
  }

  private async writeDeductions(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    deductions: readonly Deduction[],
    at: Date,
  ) {
    await this.deps.bills.replaceDeductions(
      tx,
      workspaceId,
      billId,
      deductions.map((deduction, position) => ({
        id: newId(at.getTime()),
        billId,
        kind: deduction.kind,
        description: deduction.description,
        amount: deduction.amount,
        advanceId: null,
        escalationBillId: null,
        materialId: null,
        position,
      })),
    );
  }

  private header(
    terms: ContractTerms,
    input: { billDate: string; remarks?: string | null },
    today: CalendarDate,
  ) {
    const header = raBillHeader(
      {
        billDate: input.billDate,
        measuredUpTo: input.billDate,
        remarks: input.remarks,
      },
      {
        today,
        notBefore:
          terms.workOrder == null
            ? null
            : {
                date: terms.workOrder.orderDate,
                code: "BILL_DATE_BEFORE_ORDER_DATE",
                message: "The bill date is on or after the Work Order's date.",
              },
      },
    );
    return { billDate: header.billDate, remarks: header.remarks };
  }

  private async audit(
    tx: ContractsTx,
    access: MemberAccess,
    action: string,
    id: string,
    at: Date,
    change: { before?: unknown; after?: unknown },
  ) {
    await recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action: `escalation_bill.${action}`,
      entityType: "escalation_bill",
      entityId: id,
      ...change,
      occurredAt: at,
    });
  }

  // Reads ---------------------------------------------------------------------

  /** One escalation bill with its working, GST, deductions and net (Read). */
  async get(access: MemberAccess, id: string): Promise<EscalationBillDetail> {
    const bill = await this.find(access.workspaceId, id);
    assertCan(access, this.menuOf(bill), "read", { projectId: bill.projectId });
    return this.detail(access, bill);
  }

  private async detail(
    access: MemberAccess,
    bill: StoredEscalationBill,
  ): Promise<EscalationBillDetail> {
    const { db, bills } = this.deps;
    const ws = access.workspaceId;
    const contract = contractOfBill(bill);
    const terms = await this.termsForRead(db, ws, contract, bill);
    const [deductions, names, heldBefore, recovered] = await Promise.all([
      bills.deductions(db, ws, [bill.id]),
      bills.names(
        db,
        ws,
        uniqueIds([
          bill.createdBy,
          bill.submittedBy,
          bill.decidedBy,
          bill.reversedBy,
        ]),
      ),
      terms.heldBefore(db, bill.id),
      bill.gross < 0n
        ? bills.recoveredByEscalation(db, ws, [bill.id], null)
        : Promise.resolve(new Map<string, { approved: bigint }>()),
    ]);
    const name = (userId: string | null) =>
      userId == null ? null : (names.get(userId) ?? null);
    const gst = storedBillGst(bill);
    const warnings = [...terms.warnings];
    for (const row of bill.working.components)
      if (row.basis === "quantity" && (row.quantity ?? 0n) === 0n)
        warnings.push({
          code: "ESCALATION_QUANTITY_MISSING",
          message: `Type the ${ESCALATION_COMPONENT_LABELS[row.component].toLowerCase()} used in the period: until then its 10CA amount is ₹0.`,
        });
    const recoveredAmount = recovered.get(bill.id)?.approved ?? 0n;
    return {
      bill,
      projectName: terms.project.name,
      partyId: terms.partyId,
      partyName: terms.partyName,
      workOrder:
        terms.workOrder == null
          ? null
          : {
              id: terms.workOrder.id,
              number: terms.workOrder.number,
              orderDate: terms.workOrder.orderDate,
            },
      supplyType:
        bill.igst > 0n
          ? "inter_state"
          : bill.cgst + bill.sgst > 0n
            ? "intra_state"
            : terms.gst(0n).supplyType,
      payableGst: gst.payable,
      deductions,
      retentionPercent: terms.retentionPercent,
      retentionCapPercent: terms.retentionCapPercent,
      retention: terms.retention(bill.gross, heldBefore),
      recovery:
        bill.gross < 0n && bill.status === "approved"
          ? {
              amount: -bill.gross,
              recovered: recoveredAmount,
              outstanding: -bill.gross - recoveredAmount,
            }
          : null,
      warnings,
      allowed: this.allowed(access, bill),
      createdByName: name(bill.createdBy),
      submittedByName: name(bill.submittedBy),
      decidedByName: name(bill.decidedBy),
      reversedByName: name(bill.reversedBy),
      financial: this.financial(access, bill.side, bill.projectId),
      viewerFlags: this.viewerFlags(access, bill.side, bill.projectId),
    };
  }

  /**
   * Terms for reading a stored bill: a closed or cancelled Work Order, or
   * a Project whose role changed, must not hide a bill already made.
   */
  private async termsForRead(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
    bill: StoredEscalationBill,
  ): Promise<ContractTerms> {
    try {
      return await this.terms(db, workspaceId, contract);
    } catch {
      const project = await this.project(db, workspaceId, bill.projectId);
      return {
        contract,
        project,
        workOrder: null,
        clause: null,
        partyId: bill.workOrderId ?? bill.clientId ?? "",
        partyName: "",
        departmentId: null,
        sacCode: bill.sacCode,
        gstRate: bill.gstRate,
        reverseCharge: bill.reverseCharge,
        supplierGstin: bill.supplierGstin,
        recipientGstin: bill.recipientGstin,
        clientId: bill.clientId,
        warnings: [],
        retentionPercent: 0n,
        retentionCapPercent: null,
        gst: () => storedBillGst(bill),
        retention: (gross, heldBefore) =>
          retentionSuggestion({
            gross,
            retentionPercent: 0n,
            retentionCapPercent: null,
            workOrderValue: 0n,
            heldBefore,
          }),
        heldBefore: () => Promise.resolve(0n),
      };
    }
  }

  async print(access: MemberAccess, id: string): Promise<EscalationBillPrint> {
    const bill = await this.find(access.workspaceId, id);
    assertCan(access, this.menuOf(bill), "print", {
      projectId: bill.projectId,
    });
    const detail = await this.detail(access, bill);
    return {
      ...detail,
      project: await this.project(
        this.deps.db,
        access.workspaceId,
        bill.projectId,
      ),
    };
  }

  /** What the "New escalation bill" dialog offers (Create on the side's menu). */
  async formOptions(
    access: MemberAccess,
    projectId: string,
    side: Side,
  ): Promise<EscalationFormOptions> {
    assertCan(access, SIDES[side].menu, "create", { projectId });
    const { db, workOrders, clauses, directory } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const today = await this.deps.today(ws);
    const quantityComponents = (clause: StoredEscalationClause | null) =>
      clause?.terms.components
        .filter((row) => row.basis === "quantity")
        .map((row) => row.component) ?? [];
    if (side === "client") {
      const clause = await clauses.forContract(db, ws, { side, projectId });
      return {
        side,
        workOrders: [],
        clientClause:
          clause == null
            ? null
            : {
                baseMonth: clause.terms.baseMonth,
                quantityComponents: quantityComponents(clause),
              },
        today,
      };
    }
    const [issued, closed] = await Promise.all(
      (["issued", "closed"] as const).map((status) =>
        workOrders.list(db, { workspaceId: ws, projectId, status, limit: 500 }),
      ),
    );
    const orders = [...(issued?.items ?? []), ...(closed?.items ?? [])];
    const [contractors, found] = await Promise.all([
      directory.contractors(
        db,
        ws,
        projectId,
        uniqueIds(orders.map((order) => order.contractorId)),
      ),
      Promise.all(
        orders.map((order) =>
          clauses.forContract(db, ws, {
            side: "contractor",
            projectId,
            workOrderId: order.id,
          }),
        ),
      ),
    ]);
    return {
      side,
      workOrders: orders.map((order, index) => {
        const clause = found[index] ?? null;
        return {
          id: order.id,
          number: order.number,
          contractorName: contractors.get(order.contractorId)?.name ?? "",
          baseMonth: clause?.terms.baseMonth ?? null,
          quantityComponents: quantityComponents(clause),
        };
      }),
      clientClause: null,
      today,
    };
  }

  /**
   * The working a draft would have (Create): R, the bills it takes and
   * every component, without saving anything. The same refusals as a
   * draft.
   */
  async preview(
    access: MemberAccess,
    input: CreateEscalationBillCommand,
  ): Promise<EscalationPreview> {
    const contract = contractOf(input);
    assertCan(access, SIDES[contract.side].menu, "create", {
      projectId: contract.projectId,
    });
    const { db } = this.deps;
    const ws = access.workspaceId;
    const today = await this.deps.today(ws);
    const terms = await this.terms(db, ws, contract);
    if (terms.clause == null) throw escalationClauseRequired();
    const { billDate } = this.header(terms, input, today);
    const period = this.period(terms, input, billDate);
    const working = await this.work(
      db,
      ws,
      terms,
      period,
      this.quantities(terms.clause, input.quantities, null),
    );
    return { period, working };
  }

  // Commands ------------------------------------------------------------------

  /** Drafts an escalation bill for a period (Create on the side's menu). */
  async create(
    access: MemberAccess,
    input: CreateEscalationBillCommand,
  ): Promise<StoredEscalationBill> {
    const contract = contractOf(input);
    const side = contract.side;
    assertCan(access, SIDES[side].menu, "create", {
      projectId: contract.projectId,
    });
    const { db, bills, boq } = this.deps;
    const ws = access.workspaceId;
    const [check, today] = await Promise.all([
      this.deps.backdated(access),
      this.deps.today(ws),
    ]);
    const financial = this.financial(access, side, contract.projectId);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, contract.projectId);
      const terms = await this.terms(tx, ws, contract);
      if (terms.clause == null) throw escalationClauseRequired();
      const header = this.header(terms, input, today);
      check(SIDES[side].module, "create", header.billDate);
      const period = this.period(terms, input, header.billDate);
      await this.assertNoOverlap(tx, ws, contract, period, null);
      const working = await this.work(
        tx,
        ws,
        terms,
        period,
        this.quantities(terms.clause, input.quantities, null),
      );
      const id = newId(at.getTime());
      const priced = await this.price(
        tx,
        terms,
        id,
        working.gross,
        financial && input.deductions != null
          ? { kind: "given", inputs: input.deductions }
          : { kind: "suggest" },
      );
      const bill: StoredEscalationBill = {
        id,
        workspaceId: ws,
        projectId: contract.projectId,
        side,
        type: "escalation",
        workOrderId:
          contract.side === "contractor" ? contract.workOrderId : null,
        number: null,
        ordinal: null,
        billDate: header.billDate,
        measuredUpTo: period.to,
        isFinal: false,
        status: "draft",
        remarks: header.remarks,
        invoiceId: null,
        submittedAt: null,
        submittedBy: null,
        decidedAt: null,
        decidedBy: null,
        rejectReason: null,
        reversedAt: null,
        reversedBy: null,
        reverseReason: null,
        createdAt: at,
        updatedAt: at,
        createdBy: access.userId,
        updatedBy: access.userId,
        ...this.figures(terms, working, period, priced),
      };
      await bills.insert(tx, bill);
      await this.writeDeductions(tx, ws, id, priced.deductions, at);
      await this.audit(tx, access, "created", id, at, {
        after: snapshot(bill),
      });
      return bill;
    });
  }

  /**
   * Saves a draft and works it out again (its creator with Create, or
   * Update; 409 `BILL_CHANGED` when stale). The period, bill date, remarks
   * and 10CA quantities may change; deductions only with Financial.
   */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
    input: Partial<EscalationBillCommand>,
  ): Promise<StoredEscalationBill> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "update");
    const { db, bills, boq } = this.deps;
    const ws = access.workspaceId;
    const [check, today] = await Promise.all([
      this.deps.backdated(access),
      this.deps.today(ws),
    ]);
    const financial = this.financial(access, before.side, before.projectId);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.deps.bills.find(tx, ws, id);
      if (current == null) throw clientBillNotFound();
      assertBillAction(current.status, "edit");
      assertNotStale(current, expectedUpdatedAt);
      const contract = contractOfBill(current);
      const terms = await this.terms(tx, ws, contract);
      if (terms.clause == null) throw escalationClauseRequired();
      const header = this.header(
        terms,
        {
          billDate: input.billDate ?? current.billDate,
          remarks:
            input.remarks === undefined ? current.remarks : input.remarks,
        },
        today,
      );
      const entryModule = SIDES[current.side].module;
      check(entryModule, "edit", current.billDate);
      if (header.billDate !== current.billDate)
        check(entryModule, "edit", header.billDate);
      const period = this.period(
        terms,
        {
          fromMonth: input.fromMonth ?? current.periodFrom,
          toMonth: input.toMonth ?? current.periodTo.slice(0, 7),
        },
        header.billDate,
      );
      await this.assertNoOverlap(tx, ws, contract, period, id);
      const working = await this.work(
        tx,
        ws,
        terms,
        period,
        this.quantities(terms.clause, input.quantities, current.working),
      );
      const stored = await bills.deductions(tx, ws, [id]);
      const priced = await this.price(
        tx,
        terms,
        id,
        working.gross,
        financial && input.deductions != null
          ? { kind: "given", inputs: input.deductions }
          : { kind: "keep", stored, previousGross: current.gross },
      );
      const after: StoredEscalationBill = {
        ...current,
        ...header,
        measuredUpTo: period.to,
        ...this.figures(terms, working, period, priced),
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await bills.update(tx, after, current.updatedAt)))
        throw billChanged();
      await this.writeDeductions(tx, ws, id, priced.deductions, at);
      await this.audit(tx, access, "updated", id, at, {
        before: snapshot(current),
        after: snapshot(after),
      });
      return after;
    });
  }

  /** Works a draft out again with what it has: bills approved since, indices typed since. */
  refresh(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredEscalationBill> {
    return this.update(access, id, expectedUpdatedAt, {});
  }

  /** Deletes a draft (a tombstone). */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "delete");
    const { db, bills, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await bills.find(tx, ws, id);
      if (current == null) throw clientBillNotFound();
      assertBillAction(current.status, "delete");
      assertNotStale(current, expectedUpdatedAt);
      if (
        !(await bills.delete(tx, {
          bill: current,
          expectedUpdatedAt,
          by: access.userId,
          at,
        }))
      )
        throw billChanged();
      await this.audit(tx, access, "deleted", id, at, {
        before: snapshot(current),
      });
    });
  }

  /**
   * The stored working against the working now (409
   * `ESCALATION_WORKING_CHANGED`), and no overlap with another approved or
   * pending escalation bill.
   */
  private async assertStillTrue(
    tx: ContractsTx,
    workspaceId: string,
    bill: StoredEscalationBill,
  ): Promise<ContractTerms> {
    const contract = contractOfBill(bill);
    const terms = await this.terms(tx, workspaceId, contract);
    if (terms.clause == null) throw escalationWorkingChanged();
    let now: EscalationWorking;
    try {
      now = await this.work(
        tx,
        workspaceId,
        terms,
        {
          from: bill.periodFrom,
          to: bill.periodTo,
          months: bill.working.months,
        },
        this.quantities(terms.clause, null, bill.working),
      );
    } catch {
      throw escalationWorkingChanged();
    }
    if (workingSignature(now) !== workingSignature(bill.working))
      throw escalationWorkingChanged();
    await this.assertNoOverlap(
      tx,
      workspaceId,
      contract,
      { from: bill.periodFrom, to: bill.periodTo },
      bill.id,
    );
    return terms;
  }

  /**
   * Sends a draft for approval (its creator with Create, or Update): the
   * working must still hold, the gross not be ₹0 (409
   * `ESCALATION_GROSS_ZERO`). The first submit takes the number from the
   * side's bill sequence, dated the bill date, and the next escalation
   * ordinal on the contract.
   */
  async submit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredEscalationBill> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "update");
    const { db, bills, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const submitted = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await bills.find(tx, ws, id);
      if (current == null) throw clientBillNotFound();
      assertBillAction(current.status, "submit");
      assertNotStale(current, expectedUpdatedAt);
      await this.assertStillTrue(tx, ws, current);
      if (current.gross === 0n) throw escalationGrossZero();
      const number =
        current.number ??
        (
          await nextSequenceNumber(tx, {
            workspaceId: ws,
            module: SIDES[current.side].module,
            projectId: current.projectId,
            date: current.billDate,
            by: access.userId,
          })
        ).number;
      const ordinal =
        (await bills.maxOrdinal(tx, ws, contractOfBill(current))) + 1;
      const pending = pendingState();
      const after: StoredEscalationBill = {
        ...current,
        number,
        ordinal,
        status: "pending_approval",
        submittedAt: at,
        submittedBy: access.userId,
        decidedAt: pending.decidedAt,
        decidedBy: pending.decidedBy,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await bills.update(tx, after, current.updatedAt)))
        throw billChanged();
      await this.audit(tx, access, "submitted", id, at, {
        before: snapshot(current),
        after: snapshot(after),
      });
      return after;
    });
    await dispatchBillApproval(
      this.deps.events,
      ESCALATION_DOCUMENT_TYPES[submitted.side],
      submitted,
      { kind: "submitted" },
      access.userId,
      at,
    );
    return submitted;
  }

  /**
   * Approves a pending bill (Approve): the working must still hold and the
   * period not overlap another approved one (409
   * `ESCALATION_PERIOD_OVERLAP`). A positive bill creates the finance
   * invoice (origin `ra_bill`): payable to the Contractor, or receivable
   * from the Client, for the net. A negative bill creates none: it is
   * recovered on the next running bills.
   */
  async approve(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredEscalationBill> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, this.menuOf(before), "approve", {
      projectId: before.projectId,
    });
    const { db, bills, boq, invoicing } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const decided = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await bills.find(tx, ws, id);
      if (current == null) throw clientBillNotFound();
      const state = approve(
        pendingApproval(current.status),
        { userId: access.userId, at },
        SIDES[current.side].naming,
      );
      assertNotStale(current, expectedUpdatedAt);
      const terms = await this.assertStillTrue(tx, ws, current);
      const contractor = current.side === "contractor";
      const invoiceId =
        current.net > 0n && current.number != null
          ? await invoicing.create(tx, {
              workspaceId: ws,
              by: access.userId,
              partyType: contractor ? "contractor" : "client",
              partyId: contractor
                ? terms.partyId
                : (current.clientId ?? terms.partyId),
              projectId: current.projectId,
              departmentId: terms.departmentId,
              direction: contractor ? "payable" : "receivable",
              number: current.number,
              date: current.billDate,
              taxable: current.gross,
              gst: current.reverseCharge
                ? 0n
                : current.cgst + current.sgst + current.igst,
              amount: current.net,
              sourceId: current.id,
            })
          : null;
      const after: StoredEscalationBill = {
        ...current,
        status: "approved",
        invoiceId,
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        rejectReason: null,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await bills.update(tx, after, current.updatedAt)))
        throw billChanged();
      await this.audit(tx, access, "approved", id, at, {
        before: snapshot(current),
        after: snapshot(after),
      });
      return after;
    });
    await dispatchBillApproval(
      this.deps.events,
      ESCALATION_DOCUMENT_TYPES[decided.side],
      decided,
      { kind: "approved" },
      access.userId,
      at,
    );
    return decided;
  }

  /** Rejects a pending bill with a reason (Reject); it keeps its number. */
  async reject(
    access: MemberAccess,
    id: string,
    reason: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredEscalationBill> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, this.menuOf(before), "reject", {
      projectId: before.projectId,
    });
    const { db, bills, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const decided = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await bills.find(tx, ws, id);
      if (current == null) throw clientBillNotFound();
      const state = reject(
        pendingApproval(current.status),
        { userId: access.userId, at },
        reason,
        SIDES[current.side].naming,
      );
      assertNotStale(current, expectedUpdatedAt);
      const after: StoredEscalationBill = {
        ...current,
        status: "rejected",
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        rejectReason: state.rejectionReason,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await bills.update(tx, after, current.updatedAt)))
        throw billChanged();
      await this.audit(tx, access, "rejected", id, at, {
        before: snapshot(current),
        after: snapshot(after),
      });
      return after;
    });
    await dispatchBillApproval(
      this.deps.events,
      ESCALATION_DOCUMENT_TYPES[decided.side],
      decided,
      { kind: "rejected", reason: decided.rejectReason },
      access.userId,
      at,
    );
    return decided;
  }

  /**
   * Reverses an approved bill with a reason (Approve): only the latest
   * approved escalation bill on its contract (409 `BILL_NOT_LATEST`), with
   * nothing paid against its invoice (409 `BILL_SETTLED`) and, when
   * negative, no running bill recovering it (409 `ESCALATION_RECOVERED`).
   */
  async reverse(
    access: MemberAccess,
    id: string,
    rawReason: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredEscalationBill> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, this.menuOf(before), "approve", {
      projectId: before.projectId,
    });
    const reason = reverseReason(rawReason);
    const { db, bills, boq, invoicing } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await bills.find(tx, ws, id);
      if (current == null) throw clientBillNotFound();
      assertBillAction(current.status, "reverse");
      assertNotStale(current, expectedUpdatedAt);
      const contract = contractOfBill(current);
      if ((await bills.laterApproved(tx, ws, contract, current)) > 0)
        throw billNotLatest();
      const recovered = (
        await bills.recoveredByEscalation(tx, ws, [current.id], null)
      ).get(current.id);
      if (recovered != null && recovered.count > 0)
        throw escalationRecovered(recovered.count);
      if (current.invoiceId != null) {
        if (
          await invoicing.isSettled(tx, {
            workspaceId: ws,
            invoiceId: current.invoiceId,
          })
        )
          throw billSettled();
        await invoicing.reverse(tx, {
          workspaceId: ws,
          by: access.userId,
          invoiceId: current.invoiceId,
          reason,
        });
      }
      const after: StoredEscalationBill = {
        ...current,
        status: "reversed",
        reversedAt: at,
        reversedBy: access.userId,
        reverseReason: reason,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await bills.update(tx, after, current.updatedAt)))
        throw billChanged();
      await this.audit(tx, access, "reversed", id, at, {
        before: snapshot(current),
        after: snapshot(after),
      });
      return after;
    });
  }
}

function escalationQuantityNotOnClause(index: number) {
  return new DomainError(
    "ESCALATION_QUANTITY_INVALID",
    "Quantities are typed only for the clause's 10CA (quantity) components.",
    { details: { field: `quantities.${String(index)}.component` } },
  );
}
