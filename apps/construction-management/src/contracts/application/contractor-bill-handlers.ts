import {
  assertCan,
  can,
  menuByKey,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { approve, pendingState, reject } from "@/src/shared-kernel/approval";
import {
  approvalEvent,
  type ApprovalOutcome,
} from "@/src/shared-kernel/approval-events";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { contractsProjectNotFound } from "../domain/contracts-errors";
import type { BillStatus } from "../domain/contract-terms";
import {
  assertBillAction,
  assertDeductions,
  assertWithinWorkOrder,
  billChanged,
  billDeductions,
  billFinalUnbilled,
  billGrossNotPositive,
  billGst,
  billHeader,
  billLine,
  billNet,
  billNoMeasurements,
  billNotFound,
  billNotLatest,
  billNotPending,
  billSettled,
  billValues,
  billWorkOrderInvalid,
  billWorkOrderNotIssued,
  CONTRACTOR_BILL_NAMING,
  deductionsTotal,
  finalCloseReason,
  retentionSuggestion,
  retentionTotal,
  reverseReason,
  unbilledLines,
  type BillDeduction,
  type BillDeductionInput,
  type BillGst,
  type BillLineFigures,
  type BillLineInput,
  type RetentionSuggestion,
  type UnbilledLine,
} from "../domain/contractor-bill";
import { workOrderValue } from "../domain/work-order";
import {
  CONTRACTOR_BILL_DOCUMENT_TYPE,
  CONTRACTOR_BILL_MENU,
  type BillCursor,
  type BillMeasurementRow,
  type BillTotals,
  type ContractorBillDeps,
  type ContractorTdsEstimate,
  type StoredBill,
  type StoredBillDeduction,
  type StoredBillLine,
  type UnbilledDay,
} from "./contractor-bill-ports";
import type {
  ContractsContractorFacts,
  ContractsProjectFacts,
  ContractsTx,
} from "./ports";
import type { StoredWorkOrder, StoredWorkOrderLine } from "./work-order-ports";

export {
  CONTRACTOR_BILL_DOCUMENT_TYPE,
  CONTRACTOR_BILL_MENU,
} from "./contractor-bill-ports";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type ContractorBillCommand = {
  billDate: string;
  measuredUpTo: string;
  remarks?: string | null;
  isFinal?: boolean | null;
  /** Ignored without Financial. Left out: kept (a new draft holds the suggested retention). */
  deductions?: readonly BillDeductionInput[] | null;
};

export type CreateContractorBillCommand = ContractorBillCommand & {
  workOrderId: string;
};

// ---------------------------------------------------------------------------
// What screens read
// ---------------------------------------------------------------------------

export type ContractorBillView = StoredBill & {
  workOrderNumber: string | null;
  contractorId: string;
  contractorName: string;
  departmentName: string | null;
  /** cgst + sgst + igst. */
  gstTotal: bigint;
};

export type ContractorBillLineView = StoredBillLine & {
  uomName: string;
  /** The Work Order line's quantity now; null when the line was removed. */
  workOrderQuantity: bigint | null;
  /** The measurement rows behind the line, with their location's label. */
  rows: (BillMeasurementRow & { locationLabel: string | null })[];
};

export type ContractorBillAllowed = {
  edit: boolean;
  refresh: boolean;
  delete: boolean;
  submit: boolean;
  approve: boolean;
  reject: boolean;
  reverse: boolean;
  print: boolean;
};

export type ContractorBillDetail = {
  bill: ContractorBillView;
  projectName: string;
  workOrder: {
    id: string;
    number: string | null;
    status: StoredWorkOrder["status"];
    orderDate: CalendarDate;
    retentionPercent: bigint;
    retentionCapPercent: bigint | null;
    mobilisationRecoveryPercent: bigint | null;
    tdsNature: string | null;
  };
  lines: ContractorBillLineView[];
  deductions: StoredBillDeduction[];
  supplyType: BillGst["supplyType"];
  /** GST the Contractor is paid: none under reverse charge. */
  payableGst: bigint;
  /** What this bill may hold as retention (also the most it may hold). */
  retention: RetentionSuggestion;
  /** Retention held on the Work Order's approved bills, this one included when approved. */
  retentionHeldOnWorkOrder: bigint;
  tdsEstimate: ContractorTdsEstimate | null;
  allowed: ContractorBillAllowed;
  createdByName: string | null;
  submittedByName: string | null;
  decidedByName: string | null;
  reversedByName: string | null;
  financial: boolean;
  viewerFlags: Flag[];
};

export type ContractorBillListParams = {
  status?: BillStatus;
  workOrderId?: string;
  contractorId?: string;
  from?: CalendarDate;
  to?: CalendarDate;
  limit: number;
  after?: BillCursor;
  before?: BillCursor;
};

export type ContractorBillFormOptions = {
  workOrders: {
    id: string;
    number: string | null;
    orderDate: CalendarDate;
    contractorId: string;
    contractorName: string;
    /** Checked rows waiting to be billed, per date measured. */
    unbilled: UnbilledDay[];
    /** A draft or pending bill already open on it (one at a time). */
    openBillId: string | null;
  }[];
  today: CalendarDate;
};

/** Everything the PDF prints. */
export type ContractorBillPrint = ContractorBillDetail & {
  project: ContractsProjectFacts;
  contractor: ContractsContractorFacts | null;
};

/** How a draft's deductions are found when its figures are worked out. */
type DeductionPlan =
  | { kind: "suggest" }
  | { kind: "given"; inputs: readonly BillDeductionInput[] }
  | {
      kind: "keep";
      stored: readonly StoredBillDeduction[];
      previousGross: bigint;
    };

type Measured = {
  rows: BillMeasurementRow[];
  lines: BillLineFigures[];
  gross: bigint;
  cumulativeValue: bigint;
  previousValue: bigint;
};

type Priced = {
  gst: BillGst;
  retention: RetentionSuggestion;
  deductions: BillDeduction[];
  net: bigint;
  project: ContractsProjectFacts;
  contractor: ContractsContractorFacts | null;
};

const unique = (ids: readonly (string | null)[]): string[] => [
  ...new Set(ids.filter((id): id is string => id != null && id !== "")),
];

function auditSnapshot(bill: StoredBill, lineCount?: number) {
  return {
    number: bill.number,
    ordinal: bill.ordinal,
    status: bill.status,
    workOrderId: bill.workOrderId,
    billDate: bill.billDate,
    measuredUpTo: bill.measuredUpTo,
    isFinal: bill.isFinal,
    gross: Number(bill.gross),
    gst: Number(bill.cgst + bill.sgst + bill.igst),
    reverseCharge: bill.reverseCharge,
    deductions: Number(bill.deductionsTotal),
    net: Number(bill.net),
    invoiceId: bill.invoiceId,
    ...(lineCount == null ? {} : { lineCount }),
    rejectReason: bill.rejectReason,
    reverseReason: bill.reverseReason,
  };
}

/**
 * Contractor Bills (CM-1106, ADR CM-0023 §7; menu
 * `contracts.contractor_bills`, CRUDAJPNOF, Project-level). Every command
 * takes the Project's BOQ lock first, then works on one Work Order's
 * checked measurements. Approve and Reject use the approval kernel and
 * raise `document.*` events (type `contractor_bill`); approval creates the
 * payable invoice through `PartyInvoicing`, and a Final bill closes the
 * Work Order.
 */
export class ContractorBillHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: ContractorBillDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // Loading -------------------------------------------------------------------

  async find(workspaceId: string, id: string): Promise<StoredBill> {
    const found = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (found == null) throw billNotFound();
    return found;
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

  private async workOrder(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredWorkOrder> {
    const found = await this.deps.workOrders.find(db, workspaceId, id);
    if (found == null) throw billWorkOrderInvalid();
    return found;
  }

  private async locked(
    tx: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredBill> {
    const bill = await this.deps.store.find(tx, workspaceId, id);
    if (bill == null) throw billNotFound();
    return bill;
  }

  viewerFlags(access: MemberAccess, projectId: string): Flag[] {
    const supported = fromMask(menuByKey(CONTRACTOR_BILL_MENU)?.supported ?? 0);
    return supported.filter((flag) =>
      can(access, CONTRACTOR_BILL_MENU, flag, { projectId }),
    );
  }

  financial(access: MemberAccess, projectId: string): boolean {
    return can(access, CONTRACTOR_BILL_MENU, "financial", { projectId });
  }

  /** A draft is changed by its creator (with Create) or a holder of `flag`. */
  private draftEditor(
    access: MemberAccess,
    bill: StoredBill,
    flag: "update" | "delete",
  ): boolean {
    const scope = { projectId: bill.projectId };
    return (
      (bill.createdBy === access.userId &&
        can(access, CONTRACTOR_BILL_MENU, "create", scope)) ||
      can(access, CONTRACTOR_BILL_MENU, flag, scope)
    );
  }

  private assertDraftEditor(
    access: MemberAccess,
    bill: StoredBill,
    flag: "update" | "delete",
  ): void {
    if (!this.draftEditor(access, bill, flag))
      assertCan(access, CONTRACTOR_BILL_MENU, flag, {
        projectId: bill.projectId,
      });
  }

  private allowed(
    access: MemberAccess,
    bill: StoredBill,
  ): ContractorBillAllowed {
    const scope = { projectId: bill.projectId };
    const draft = bill.status === "draft";
    const pending = bill.status === "pending_approval";
    const editor = draft && this.draftEditor(access, bill, "update");
    return {
      edit: editor,
      refresh: editor,
      submit: editor,
      delete: draft && this.draftEditor(access, bill, "delete"),
      approve: pending && can(access, CONTRACTOR_BILL_MENU, "approve", scope),
      reject: pending && can(access, CONTRACTOR_BILL_MENU, "reject", scope),
      reverse:
        bill.status === "approved" &&
        can(access, CONTRACTOR_BILL_MENU, "approve", scope),
      print: can(access, CONTRACTOR_BILL_MENU, "print", scope),
    };
  }

  /** Work Order numbers and Contractor names for lists and details. */
  async views(
    db: ContractsTx,
    workspaceId: string,
    bills: readonly StoredBill[],
  ): Promise<ContractorBillView[]> {
    if (bills.length === 0) return [];
    const { directory, workOrders } = this.deps;
    const orders = new Map<string, StoredWorkOrder>();
    await Promise.all(
      unique(bills.map((bill) => bill.workOrderId)).map(async (id) => {
        const found = await workOrders.find(db, workspaceId, id);
        if (found != null) orders.set(id, found);
      }),
    );
    const byProject = new Map<string, string[]>();
    for (const order of orders.values())
      byProject.set(order.projectId, [
        ...(byProject.get(order.projectId) ?? []),
        order.contractorId,
      ]);
    const [contractorMaps, departments] = await Promise.all([
      Promise.all(
        [...byProject].map(([projectId, ids]) =>
          directory.contractors(db, workspaceId, projectId, unique(ids)),
        ),
      ),
      directory.departments(
        db,
        workspaceId,
        unique([...orders.values()].map((order) => order.departmentId)),
      ),
    ]);
    const contractors = new Map<string, ContractsContractorFacts>();
    for (const map of contractorMaps)
      for (const [id, facts] of map) contractors.set(id, facts);
    return bills.map((bill) => {
      const order = orders.get(bill.workOrderId);
      return {
        ...bill,
        workOrderNumber: order?.number ?? null,
        contractorId: order?.contractorId ?? "",
        contractorName:
          order == null
            ? ""
            : (contractors.get(order.contractorId)?.name ?? ""),
        departmentName:
          order?.departmentId == null
            ? null
            : (departments.get(order.departmentId)?.name ?? null),
        gstTotal: bill.cgst + bill.sgst + bill.igst,
      };
    });
  }

  // Reads ---------------------------------------------------------------------

  /**
   * The Project's Contractor Bills, newest first (read), with the totals
   * of the bills the filter matches that count (not rejected or reversed)
   * and the retention held per Contractor on the Project.
   */
  async list(
    access: MemberAccess,
    projectId: string,
    params: ContractorBillListParams,
  ): Promise<{
    items: ContractorBillView[];
    total: number;
    hasMore: boolean;
    totals: BillTotals;
    retentionHeld: {
      contractorId: string;
      contractorName: string;
      amount: bigint;
    }[];
    financial: boolean;
    viewerFlags: Flag[];
  }> {
    assertCan(access, CONTRACTOR_BILL_MENU, "read", { projectId });
    const { db, store, directory } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const filter = {
      workspaceId: ws,
      projectId,
      status: params.status,
      workOrderId: params.workOrderId,
      contractorId: params.contractorId,
      from: params.from,
      to: params.to,
    };
    const [page, totals, held] = await Promise.all([
      store.list(db, {
        ...filter,
        limit: params.limit,
        after: params.after,
        before: params.before,
      }),
      store.totals(db, filter),
      store.retentionHeldByContractor(db, ws, projectId),
    ]);
    const names = await directory.contractors(db, ws, projectId, [
      ...held.keys(),
    ]);
    return {
      items: await this.views(db, ws, page.items),
      total: page.total,
      hasMore: page.hasMore,
      totals,
      retentionHeld: [...held]
        .filter(([, amount]) => amount !== 0n)
        .map(([contractorId, amount]) => ({
          contractorId,
          contractorName: names.get(contractorId)?.name ?? "",
          amount,
        }))
        .sort((a, b) => a.contractorName.localeCompare(b.contractorName)),
      financial: this.financial(access, projectId),
      viewerFlags: this.viewerFlags(access, projectId),
    };
  }

  /** One bill with its lines, the rows behind them, deductions and estimates (read). */
  async get(access: MemberAccess, id: string): Promise<ContractorBillDetail> {
    const bill = await this.find(access.workspaceId, id);
    assertCan(access, CONTRACTOR_BILL_MENU, "read", {
      projectId: bill.projectId,
    });
    return this.detail(access, bill);
  }

  private async detail(
    access: MemberAccess,
    bill: StoredBill,
  ): Promise<ContractorBillDetail> {
    const { db, store, workOrders, directory } = this.deps;
    const ws = access.workspaceId;
    const [project, [view], lines, deductions, rows, order, woLines] =
      await Promise.all([
        this.project(db, ws, bill.projectId),
        this.views(db, ws, [bill]),
        store.lines(db, ws, [bill.id]),
        store.deductions(db, ws, [bill.id]),
        store.rowsOfBill(db, ws, bill.id),
        this.workOrder(db, ws, bill.workOrderId),
        workOrders.lines(db, ws, [bill.workOrderId]),
      ]);
    if (view == null) throw billNotFound();
    const [uoms, names, heldBefore, contractors, labelOf] = await Promise.all([
      directory.uoms(
        db,
        ws,
        lines.map((line) => line.uomId),
      ),
      store.names(
        db,
        ws,
        unique([
          bill.createdBy,
          bill.submittedBy,
          bill.decidedBy,
          bill.reversedBy,
        ]),
      ),
      store.retentionHeld(db, ws, bill.workOrderId, bill.id),
      directory.contractors(db, ws, bill.projectId, [order.contractorId]),
      rows.some((row) => row.location != null)
        ? this.deps.locationLabels(ws, bill.projectId)
        : Promise.resolve(() => null),
    ]);
    const quantities = new Map(woLines.map((line) => [line.id, line.quantity]));
    const retention = retentionSuggestion({
      gross: bill.gross,
      retentionPercent: order.terms.retentionPercent,
      retentionCapPercent: order.terms.retentionCapPercent,
      workOrderValue: workOrderValue(woLines),
      heldBefore,
    });
    const gst = this.storedGst(bill);
    const name = (userId: string | null) =>
      userId == null ? null : (names.get(userId) ?? null);
    const financial = this.financial(access, bill.projectId);
    const tdsEstimate = financial
      ? await this.deps.tds(db, {
          workspaceId: ws,
          contractorId: order.contractorId,
          date: bill.billDate,
          base: bill.gross,
        })
      : null;
    const contractor = contractors.get(order.contractorId);
    return {
      bill: view,
      projectName: project.name,
      workOrder: {
        id: order.id,
        number: order.number,
        status: order.status,
        orderDate: order.orderDate,
        retentionPercent: order.terms.retentionPercent,
        retentionCapPercent: order.terms.retentionCapPercent,
        mobilisationRecoveryPercent: order.terms.mobilisationRecoveryPercent,
        tdsNature: order.terms.tdsNature,
      },
      lines: lines.map((line) => ({
        ...line,
        uomName: uoms.get(line.uomId)?.name ?? "",
        workOrderQuantity: quantities.get(line.workOrderLineId) ?? null,
        rows: rows
          .filter((row) => row.workOrderLineId === line.workOrderLineId)
          .map((row) => ({ ...row, locationLabel: labelOf(row.location) })),
      })),
      deductions,
      supplyType:
        bill.igst > 0n
          ? "inter_state"
          : bill.cgst + bill.sgst > 0n
            ? "intra_state"
            : billGst({
                gross: 0n,
                gstRate: null,
                reverseCharge: false,
                supplierStateCode: contractor?.stateCode ?? null,
                placeOfSupplyStateCode: bill.placeOfSupplyStateCode,
              }).supplyType,
      payableGst: gst.payable,
      retention,
      retentionHeldOnWorkOrder:
        heldBefore +
        (bill.status === "approved" ? retentionTotal(deductions) : 0n),
      tdsEstimate,
      allowed: this.allowed(access, bill),
      createdByName: name(bill.createdBy),
      submittedByName: name(bill.submittedBy),
      decidedByName: name(bill.decidedBy),
      reversedByName: name(bill.reversedBy),
      financial,
      viewerFlags: this.viewerFlags(access, bill.projectId),
    };
  }

  /** The bill as the PDF prints it (Print). */
  async print(access: MemberAccess, id: string): Promise<ContractorBillPrint> {
    const bill = await this.find(access.workspaceId, id);
    assertCan(access, CONTRACTOR_BILL_MENU, "print", {
      projectId: bill.projectId,
    });
    const { db, directory } = this.deps;
    const detail = await this.detail(access, bill);
    const [project, contractors] = await Promise.all([
      this.project(db, access.workspaceId, bill.projectId),
      directory.contractors(db, access.workspaceId, bill.projectId, [
        detail.bill.contractorId,
      ]),
    ]);
    return {
      ...detail,
      project,
      contractor: contractors.get(detail.bill.contractorId) ?? null,
    };
  }

  /**
   * The Project's issued Work Orders with their checked rows waiting to be
   * billed per date, and any bill already open (Create).
   */
  async formOptions(
    access: MemberAccess,
    projectId: string,
  ): Promise<ContractorBillFormOptions> {
    assertCan(access, CONTRACTOR_BILL_MENU, "create", { projectId });
    const { db, store, workOrders, directory } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const issued = await workOrders.list(db, {
      workspaceId: ws,
      projectId,
      status: "issued",
      limit: 500,
    });
    const ids = issued.items.map((order) => order.id);
    const [days, contractors, open, today] = await Promise.all([
      store.unbilledDays(db, ws, ids),
      directory.contractors(
        db,
        ws,
        projectId,
        unique(issued.items.map((order) => order.contractorId)),
      ),
      Promise.all(
        ids.map(async (workOrderId) => {
          const page = await store.list(db, {
            workspaceId: ws,
            projectId,
            workOrderId,
            limit: 1,
          });
          // No bill can be drafted on a Work Order while one is open, so
          // an open bill is always its newest.
          const found = page.items.find(
            (bill) =>
              bill.status === "draft" || bill.status === "pending_approval",
          );
          return [workOrderId, found?.id ?? null] as const;
        }),
      ),
      this.deps.today(ws),
    ]);
    const openBills = new Map(open);
    return {
      workOrders: issued.items.map((order) => ({
        id: order.id,
        number: order.number,
        orderDate: order.orderDate,
        contractorId: order.contractorId,
        contractorName: contractors.get(order.contractorId)?.name ?? "",
        unbilled: days.get(order.id) ?? [],
        openBillId: openBills.get(order.id) ?? null,
      })),
      today,
    };
  }

  /** Live bills per Work Order (not rejected or reversed), for the Work Order page. */
  async countsByWorkOrder(
    access: MemberAccess,
    projectId: string,
    workOrderIds: readonly string[],
  ): Promise<Map<string, number>> {
    if (!can(access, CONTRACTOR_BILL_MENU, "read", { projectId }))
      return new Map();
    return this.deps.store.countsByWorkOrder(
      this.deps.db,
      access.workspaceId,
      workOrderIds,
    );
  }

  // Figures -------------------------------------------------------------------

  private storedGst(bill: StoredBill): BillGst {
    const total = bill.cgst + bill.sgst + bill.igst;
    return {
      supplyType: bill.igst > 0n ? "inter_state" : "intra_state",
      rate: bill.gstRate ?? 0n,
      cgst: bill.cgst,
      sgst: bill.sgst,
      igst: bill.igst,
      total,
      reverseCharge: bill.reverseCharge,
      payable: bill.reverseCharge ? 0n : total,
    };
  }

  /**
   * The rows a bill takes and its abstract: every checked row of the Work
   * Order up to `measuredUpTo` not taken by a bill (the caller frees the
   * bill's own rows first), summed per line, with the previous quantities
   * of approved bills (400 `BILL_NO_MEASUREMENTS` when none; 409
   * `WORK_ORDER_QUANTITY_EXCEEDED` past a line's quantity).
   */
  private async measure(
    tx: ContractsTx,
    workspaceId: string,
    workOrder: StoredWorkOrder,
    measuredUpTo: CalendarDate,
  ): Promise<Measured> {
    const { store, workOrders } = this.deps;
    const [rows, woLines, billed] = await Promise.all([
      store.billableRows(tx, {
        workspaceId,
        workOrderId: workOrder.id,
        measuredUpTo,
      }),
      workOrders.lines(tx, workspaceId, [workOrder.id]),
      workOrders.billedByLine(tx, workspaceId, workOrder.id),
    ]);
    if (rows.length === 0) throw billNoMeasurements();
    const sums = new Map<string, bigint>();
    for (const row of rows)
      sums.set(
        row.workOrderLineId,
        (sums.get(row.workOrderLineId) ?? 0n) + row.quantity,
      );
    const byId = new Map(woLines.map((line) => [line.id, line]));
    const order = (lineId: string) =>
      byId.get(lineId)?.position ?? Number.MAX_SAFE_INTEGER;
    const inputs: BillLineInput[] = [...sums]
      .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
      .map(([lineId, quantity]) => {
        const line: StoredWorkOrderLine | undefined = byId.get(lineId);
        return {
          workOrderLineId: lineId,
          itemNo: line?.itemNo ?? null,
          description: line?.description ?? "",
          uomId: line?.uomId ?? "",
          rate: line?.rate ?? 0n,
          workOrderQuantity: line?.quantity ?? null,
          previousQuantity: billed.get(lineId) ?? 0n,
          quantity,
        };
      });
    const lines = inputs.map(billLine);
    assertWithinWorkOrder(lines);
    return { rows, lines, ...billValues(lines) };
  }

  /**
   * GST from the Work Order's terms, the retention suggestion and the
   * deductions by `plan`, checked against them; the net.
   */
  private async price(
    tx: ContractsTx,
    workspaceId: string,
    workOrder: StoredWorkOrder,
    billId: string,
    gross: bigint,
    plan: DeductionPlan,
    storedGst: BillGst | null,
  ): Promise<Priced> {
    const { directory, store, workOrders } = this.deps;
    const [project, contractors, woLines, heldBefore] = await Promise.all([
      this.project(tx, workspaceId, workOrder.projectId),
      directory.contractors(tx, workspaceId, workOrder.projectId, [
        workOrder.contractorId,
      ]),
      workOrders.lines(tx, workspaceId, [workOrder.id]),
      store.retentionHeld(tx, workspaceId, workOrder.id, billId),
    ]);
    const contractor = contractors.get(workOrder.contractorId) ?? null;
    const gst =
      storedGst ??
      billGst({
        gross,
        gstRate: workOrder.terms.gstRate,
        reverseCharge: workOrder.terms.reverseCharge,
        supplierStateCode: contractor?.stateCode ?? null,
        placeOfSupplyStateCode: project.stateCode,
      });
    const suggestionFor = (amount: bigint) =>
      retentionSuggestion({
        gross: amount,
        retentionPercent: workOrder.terms.retentionPercent,
        retentionCapPercent: workOrder.terms.retentionCapPercent,
        workOrderValue: workOrderValue(woLines),
        heldBefore,
      });
    const retention = suggestionFor(gross);
    const retentionLine = (amount: bigint): BillDeduction[] =>
      amount > 0n
        ? [{ kind: "retention", amount, description: null, advanceId: null }]
        : [];
    let deductions: BillDeduction[];
    if (plan.kind === "suggest")
      deductions = retentionLine(retention.suggested);
    else if (plan.kind === "given") deductions = billDeductions(plan.inputs);
    else {
      const kept: BillDeduction[] = plan.stored.map((row) => ({
        kind: row.kind as BillDeduction["kind"],
        amount: row.amount,
        description: row.description,
        advanceId: row.advanceId,
      }));
      const others = kept.filter((row) => row.kind !== "retention");
      const held = retentionTotal(kept);
      const untouched = held === suggestionFor(plan.previousGross).suggested;
      // Retention left as suggested follows the new gross; typed retention
      // stays, cut to what the cap now allows.
      deductions =
        untouched || held > retention.suggested
          ? [...retentionLine(retention.suggested), ...others]
          : kept;
    }
    assertDeductions({
      deductions,
      gross,
      payableGst: gst.payable,
      retentionMax: retention.suggested,
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
      project,
      contractor,
    };
  }

  /** Writes a bill's abstract, deductions and figures. */
  private async write(
    tx: ContractsTx,
    workspaceId: string,
    before: StoredBill,
    after: StoredBill,
    content: {
      measured: Measured | null;
      deductions: readonly BillDeduction[];
    },
    at: Date,
  ): Promise<void> {
    const { store } = this.deps;
    if (!(await store.update(tx, after, before.updatedAt))) throw billChanged();
    if (content.measured != null) {
      await store.takeRows(
        tx,
        workspaceId,
        after.id,
        content.measured.rows.map((row) => row.id),
      );
      await store.replaceLines(
        tx,
        workspaceId,
        after.id,
        content.measured.lines.map((line, position) => ({
          id: newId(at.getTime()),
          billId: after.id,
          workOrderLineId: line.workOrderLineId,
          itemNo: line.itemNo,
          description: line.description,
          uomId: line.uomId,
          rate: line.rate,
          cumulativeQuantity: line.cumulativeQuantity,
          previousQuantity: line.previousQuantity,
          quantity: line.quantity,
          amount: line.amount,
          position,
        })),
      );
    }
    await store.replaceDeductions(
      tx,
      workspaceId,
      after.id,
      content.deductions.map((deduction, position) => ({
        id: newId(at.getTime()),
        billId: after.id,
        kind: deduction.kind,
        description: deduction.description,
        amount: deduction.amount,
        advanceId: deduction.advanceId,
        position,
      })),
    );
  }

  private figures(
    measured: Pick<Measured, "gross" | "cumulativeValue" | "previousValue">,
    priced: Priced,
    workOrder: StoredWorkOrder,
  ) {
    return {
      cumulativeValue: measured.cumulativeValue,
      previousValue: measured.previousValue,
      gross: measured.gross,
      sacCode: workOrder.terms.sacCode,
      gstRate: workOrder.terms.gstRate,
      placeOfSupplyStateCode: priced.project.stateCode,
      supplierGstin: priced.contractor?.gstin ?? null,
      reverseCharge: priced.gst.reverseCharge,
      cgst: priced.gst.cgst,
      sgst: priced.gst.sgst,
      igst: priced.gst.igst,
      deductionsTotal: deductionsTotal(priced.deductions),
      net: priced.net,
    };
  }

  private checkStale(bill: StoredBill, expected: Date | null) {
    if (expected != null && bill.updatedAt.getTime() !== expected.getTime())
      throw billChanged();
  }

  private assertIssued(workOrder: StoredWorkOrder): void {
    if (workOrder.status !== "issued")
      throw billWorkOrderNotIssued(workOrder.status);
  }

  private async audit(
    tx: ContractsTx,
    access: MemberAccess,
    action: string,
    id: string,
    at: Date,
    change: { before?: unknown; after?: unknown },
  ): Promise<void> {
    await recordAudit(tx, {
      workspaceId: access.workspaceId,
      actorUserId: access.userId,
      action,
      entityType: "contractor_bill",
      entityId: id,
      ...change,
      occurredAt: at,
    });
  }

  private async dispatch(
    bill: StoredBill,
    outcome: ApprovalOutcome,
    by: string,
    at: Date,
  ): Promise<void> {
    await this.deps.events.dispatch([
      approvalEvent(
        {
          workspaceId: bill.workspaceId,
          documentType: CONTRACTOR_BILL_DOCUMENT_TYPE,
          documentId: bill.id,
          projectId: bill.projectId,
          number: bill.number,
          createdBy: bill.createdBy,
        },
        outcome,
        by,
        at,
      ),
    ]);
  }

  // Commands ------------------------------------------------------------------

  /**
   * Drafts a bill on an issued Work Order of the Project (Create): takes
   * every checked row up to "measured up to" not yet billed, and holds the
   * suggested retention unless deductions are sent (with Financial).
   * 409 `BILL_OPEN_EXISTS` while another bill on it is draft or pending.
   */
  async create(
    access: MemberAccess,
    projectId: string,
    input: CreateContractorBillCommand,
  ): Promise<StoredBill> {
    assertCan(access, CONTRACTOR_BILL_MENU, "create", { projectId });
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const [check, today] = await Promise.all([
      this.deps.backdated(access),
      this.deps.today(ws),
    ]);
    const financial = this.financial(access, projectId);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, projectId);
      const workOrder = await this.workOrder(tx, ws, input.workOrderId.trim());
      if (workOrder.projectId !== projectId || workOrder.status !== "issued")
        throw billWorkOrderInvalid();
      const header = billHeader(input, {
        today,
        orderDate: workOrder.orderDate,
      });
      check("contractor_bill", "create", header.billDate);
      const draft: StoredBill = {
        id: newId(at.getTime()),
        workspaceId: ws,
        projectId,
        workOrderId: workOrder.id,
        number: null,
        ordinal: null,
        ...header,
        status: "draft",
        cumulativeValue: 0n,
        previousValue: 0n,
        gross: 0n,
        sacCode: null,
        gstRate: null,
        placeOfSupplyStateCode: null,
        supplierGstin: null,
        reverseCharge: false,
        cgst: 0n,
        sgst: 0n,
        igst: 0n,
        deductionsTotal: 0n,
        net: 0n,
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
      };
      // The partial index refuses a second open bill before anything else.
      await store.insert(tx, draft);
      const measured = await this.measure(
        tx,
        ws,
        workOrder,
        header.measuredUpTo,
      );
      const priced = await this.price(
        tx,
        ws,
        workOrder,
        draft.id,
        measured.gross,
        financial && input.deductions != null
          ? { kind: "given", inputs: input.deductions }
          : { kind: "suggest" },
        null,
      );
      const after: StoredBill = {
        ...draft,
        ...this.figures(measured, priced, workOrder),
      };
      await this.write(
        tx,
        ws,
        draft,
        after,
        { measured, deductions: priced.deductions },
        at,
      );
      await this.audit(tx, access, "contractor_bill.created", draft.id, at, {
        after: auditSnapshot(after, measured.lines.length),
      });
      return after;
    });
  }

  /**
   * Saves a draft's header and deductions (its creator with Create, or
   * Update; 409 `BILL_CHANGED` when stale). A new "measured up to" takes
   * the rows again as a refresh does; otherwise the abstract and GST stay.
   * Deductions are taken only with Financial.
   */
  async update(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date,
    input: ContractorBillCommand,
  ): Promise<StoredBill> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "update");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const [check, today] = await Promise.all([
      this.deps.backdated(access),
      this.deps.today(ws),
    ]);
    const financial = this.financial(access, before.projectId);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      assertBillAction(current.status, "edit");
      this.checkStale(current, expectedUpdatedAt);
      const workOrder = await this.workOrder(tx, ws, current.workOrderId);
      this.assertIssued(workOrder);
      const header = billHeader(input, {
        today,
        orderDate: workOrder.orderDate,
      });
      check("contractor_bill", "edit", current.billDate);
      if (header.billDate !== current.billDate)
        check("contractor_bill", "edit", header.billDate);
      const remeasure = header.measuredUpTo !== current.measuredUpTo;
      const stored = await store.deductions(tx, ws, [id]);
      let measured: Measured | null = null;
      if (remeasure) {
        await store.freeRows(tx, ws, id);
        measured = await this.measure(tx, ws, workOrder, header.measuredUpTo);
      }
      const gross = measured?.gross ?? current.gross;
      const priced = await this.price(
        tx,
        ws,
        workOrder,
        id,
        gross,
        financial && input.deductions != null
          ? { kind: "given", inputs: input.deductions }
          : { kind: "keep", stored, previousGross: current.gross },
        measured == null ? this.storedGst(current) : null,
      );
      const after: StoredBill = {
        ...current,
        ...header,
        ...this.figures(measured ?? current, priced, workOrder),
        ...(measured == null
          ? {
              sacCode: current.sacCode,
              gstRate: current.gstRate,
              placeOfSupplyStateCode: current.placeOfSupplyStateCode,
              supplierGstin: current.supplierGstin,
            }
          : {}),
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.write(
        tx,
        ws,
        current,
        after,
        { measured, deductions: priced.deductions },
        at,
      );
      await this.audit(tx, access, "contractor_bill.updated", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      return after;
    });
  }

  /**
   * Takes a draft's rows again (its creator with Create, or Update): rows
   * checked since, up to its date or a new one, at the Work Order's rates
   * and terms now. Retention left as suggested follows the new gross.
   */
  async refresh(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
    measuredUpTo: string | null,
  ): Promise<StoredBill> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "update");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const today = await this.deps.today(ws);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      assertBillAction(current.status, "refresh");
      this.checkStale(current, expectedUpdatedAt);
      const workOrder = await this.workOrder(tx, ws, current.workOrderId);
      this.assertIssued(workOrder);
      const header = billHeader(
        {
          billDate: current.billDate,
          measuredUpTo:
            measuredUpTo == null || measuredUpTo.trim() === ""
              ? current.measuredUpTo
              : assertCalendarDate(
                  measuredUpTo.trim(),
                  "MEASURED_UP_TO_INVALID",
                ),
          remarks: current.remarks,
          isFinal: current.isFinal,
        },
        { today, orderDate: workOrder.orderDate },
      );
      const stored = await store.deductions(tx, ws, [id]);
      await store.freeRows(tx, ws, id);
      const measured = await this.measure(
        tx,
        ws,
        workOrder,
        header.measuredUpTo,
      );
      const priced = await this.price(
        tx,
        ws,
        workOrder,
        id,
        measured.gross,
        { kind: "keep", stored, previousGross: current.gross },
        null,
      );
      const after: StoredBill = {
        ...current,
        measuredUpTo: header.measuredUpTo,
        ...this.figures(measured, priced, workOrder),
        updatedAt: at,
        updatedBy: access.userId,
      };
      await this.write(
        tx,
        ws,
        current,
        after,
        { measured, deductions: priced.deductions },
        at,
      );
      await this.audit(tx, access, "contractor_bill.refreshed", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after, measured.lines.length),
      });
      return after;
    });
  }

  /** Deletes a draft (a tombstone) and frees its rows. */
  async delete(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<void> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "delete");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      assertBillAction(current.status, "delete");
      this.checkStale(current, expectedUpdatedAt);
      const freed = await store.freeRows(tx, ws, id);
      const deleted = await store.delete(tx, {
        bill: current,
        expectedUpdatedAt,
        by: access.userId,
        at,
      });
      if (!deleted) throw billChanged();
      await this.audit(tx, access, "contractor_bill.deleted", id, at, {
        before: { ...auditSnapshot(current), rowsFreed: freed },
      });
    });
  }

  /**
   * Sends a draft for approval (its creator with Create, or Update). The
   * first submission takes its number from the `contractor_bill` sequence
   * rule, dated the bill date, and its ordinal on the Work Order. The
   * abstract is checked against the Work Order again; the gross must be
   * more than ₹0.
   */
  async submit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredBill> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "update");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const submitted = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      assertBillAction(current.status, "submit");
      this.checkStale(current, expectedUpdatedAt);
      const workOrder = await this.workOrder(tx, ws, current.workOrderId);
      this.assertIssued(workOrder);
      await this.assertAbstractFits(tx, ws, current);
      if (current.gross <= 0n) throw billGrossNotPositive();
      const number =
        current.number ??
        (
          await nextSequenceNumber(tx, {
            workspaceId: ws,
            module: "contractor_bill",
            projectId: current.projectId,
            date: current.billDate,
            by: access.userId,
          })
        ).number;
      const ordinal = (await store.maxOrdinal(tx, ws, current.workOrderId)) + 1;
      const pending = pendingState();
      const after: StoredBill = {
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
      if (!(await store.update(tx, after, current.updatedAt)))
        throw billChanged();
      await this.audit(tx, access, "contractor_bill.submitted", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      return after;
    });
    await this.dispatch(submitted, { kind: "submitted" }, access.userId, at);
    return submitted;
  }

  /**
   * The stored abstract against the Work Order now: an amendment may have
   * cut or removed a line since the bill was drafted (409
   * `WORK_ORDER_QUANTITY_EXCEEDED`). Returns the lines and the Work
   * Order's.
   */
  private async assertAbstractFits(
    tx: ContractsTx,
    workspaceId: string,
    bill: StoredBill,
  ): Promise<{
    lines: StoredBillLine[];
    woLines: StoredWorkOrderLine[];
    billed: Map<string, bigint>;
  }> {
    const { store, workOrders } = this.deps;
    const [lines, woLines, billed] = await Promise.all([
      store.lines(tx, workspaceId, [bill.id]),
      workOrders.lines(tx, workspaceId, [bill.workOrderId]),
      workOrders.billedByLine(tx, workspaceId, bill.workOrderId),
    ]);
    const quantities = new Map(woLines.map((line) => [line.id, line.quantity]));
    assertWithinWorkOrder(
      lines.map((line) => ({
        workOrderLineId: line.workOrderLineId,
        itemNo: line.itemNo,
        cumulativeQuantity:
          (billed.get(line.workOrderLineId) ?? 0n) + line.quantity,
        workOrderQuantity: quantities.get(line.workOrderLineId) ?? null,
      })),
    );
    return { lines, woLines, billed };
  }

  /**
   * Approves a pending bill (Approve; 409 `BILL_NOT_PENDING`): the
   * abstract is checked against the Work Order again, the payable invoice
   * is created in finance (origin `ra_bill`, amount = net; none when the
   * net is ₹0), and a **Final** bill closes the Work Order on the bill
   * date. A Final bill that leaves Work Order lines short needs
   * `confirmUnbilled` (409 `BILL_FINAL_UNBILLED`, `details.lines`).
   */
  async approve(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
    options: { confirmUnbilled?: boolean } = {},
  ): Promise<StoredBill> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, CONTRACTOR_BILL_MENU, "approve", {
      projectId: before.projectId,
    });
    const { db, store, boq, workOrders, invoicing } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const decided = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      const state = approve(
        this.approvalState(current),
        { userId: access.userId, at },
        CONTRACTOR_BILL_NAMING,
      );
      this.checkStale(current, expectedUpdatedAt);
      const workOrder = await this.workOrder(tx, ws, current.workOrderId);
      this.assertIssued(workOrder);
      const { lines, woLines, billed } = await this.assertAbstractFits(
        tx,
        ws,
        current,
      );
      if (current.isFinal && options.confirmUnbilled !== true) {
        const withThis = new Map(billed);
        for (const line of lines)
          withThis.set(
            line.workOrderLineId,
            (withThis.get(line.workOrderLineId) ?? 0n) + line.quantity,
          );
        const short: UnbilledLine[] = unbilledLines(woLines, withThis);
        if (short.length > 0) throw billFinalUnbilled(short);
      }
      const invoiceId =
        current.net > 0n && current.number != null
          ? await invoicing.create(tx, {
              workspaceId: ws,
              by: access.userId,
              partyType: "contractor",
              partyId: workOrder.contractorId,
              projectId: current.projectId,
              departmentId: workOrder.departmentId,
              direction: "payable",
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
      const after: StoredBill = {
        ...current,
        status: "approved",
        invoiceId,
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        rejectReason: null,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await store.update(tx, after, current.updatedAt)))
        throw billChanged();
      if (current.isFinal) {
        const closed: StoredWorkOrder = {
          ...workOrder,
          status: "closed",
          closedOn: current.billDate,
          closeReason: finalCloseReason(current.number ?? ""),
          completedOn: workOrder.completedOn ?? current.billDate,
          updatedAt: at,
          updatedBy: access.userId,
        };
        if (!(await workOrders.update(tx, closed, workOrder.updatedAt)))
          throw billChanged();
        await recordAudit(tx, {
          workspaceId: ws,
          actorUserId: access.userId,
          action: "work_order.closed",
          entityType: "work_order",
          entityId: workOrder.id,
          before: { status: workOrder.status, closedOn: workOrder.closedOn },
          after: {
            status: closed.status,
            closedOn: closed.closedOn,
            closeReason: closed.closeReason,
            billId: current.id,
          },
          occurredAt: at,
        });
      }
      await this.audit(tx, access, "contractor_bill.approved", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      return after;
    });
    await this.dispatch(decided, { kind: "approved" }, access.userId, at);
    return decided;
  }

  /**
   * Rejects a pending bill with a reason (Reject): it stays as a record,
   * keeps its number, and frees its rows for the next bill.
   */
  async reject(
    access: MemberAccess,
    id: string,
    reason: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredBill> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, CONTRACTOR_BILL_MENU, "reject", {
      projectId: before.projectId,
    });
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const decided = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      const state = reject(
        this.approvalState(current),
        { userId: access.userId, at },
        reason,
        CONTRACTOR_BILL_NAMING,
      );
      this.checkStale(current, expectedUpdatedAt);
      const freed = await store.freeRows(tx, ws, id);
      const after: StoredBill = {
        ...current,
        status: "rejected",
        decidedAt: state.decidedAt,
        decidedBy: state.decidedBy,
        rejectReason: state.rejectionReason,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await store.update(tx, after, current.updatedAt)))
        throw billChanged();
      await this.audit(tx, access, "contractor_bill.rejected", id, at, {
        before: auditSnapshot(current),
        after: { ...auditSnapshot(after), rowsFreed: freed },
      });
      return after;
    });
    await this.dispatch(
      decided,
      { kind: "rejected", reason: decided.rejectReason },
      access.userId,
      at,
    );
    return decided;
  }

  /**
   * Reverses an approved bill with a reason (Approve): only the latest on
   * its Work Order with no later bill open (409 `BILL_NOT_LATEST`) and
   * nothing paid or written off against its invoice (409 `BILL_SETTLED`).
   * The invoice is reversed in finance, the rows are freed, and a Final
   * bill's Work Order is issued again.
   */
  async reverse(
    access: MemberAccess,
    id: string,
    rawReason: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredBill> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, CONTRACTOR_BILL_MENU, "approve", {
      projectId: before.projectId,
    });
    const reason = reverseReason(rawReason);
    const { db, store, boq, workOrders, invoicing } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      assertBillAction(current.status, "reverse");
      this.checkStale(current, expectedUpdatedAt);
      if ((await store.laterBills(tx, ws, current)) > 0) throw billNotLatest();
      if (
        current.invoiceId != null &&
        (await invoicing.isSettled(tx, {
          workspaceId: ws,
          invoiceId: current.invoiceId,
        }))
      )
        throw billSettled();
      if (current.invoiceId != null)
        await invoicing.reverse(tx, {
          workspaceId: ws,
          by: access.userId,
          invoiceId: current.invoiceId,
          reason,
        });
      const freed = await store.freeRows(tx, ws, id);
      const after: StoredBill = {
        ...current,
        status: "reversed",
        reversedAt: at,
        reversedBy: access.userId,
        reverseReason: reason,
        updatedAt: at,
        updatedBy: access.userId,
      };
      if (!(await store.update(tx, after, current.updatedAt)))
        throw billChanged();
      if (current.isFinal) {
        const workOrder = await workOrders.find(tx, ws, current.workOrderId);
        if (workOrder?.status === "closed") {
          // Only a Final bill closes a Work Order that billing then
          // reopens: the close date and reason go, and the completion date
          // the close set with them.
          const reopened: StoredWorkOrder = {
            ...workOrder,
            status: "issued",
            closedOn: null,
            closeReason: null,
            completedOn:
              workOrder.completedOn === workOrder.closedOn
                ? null
                : workOrder.completedOn,
            updatedAt: at,
            updatedBy: access.userId,
          };
          if (!(await workOrders.update(tx, reopened, workOrder.updatedAt)))
            throw billChanged();
          await recordAudit(tx, {
            workspaceId: ws,
            actorUserId: access.userId,
            action: "work_order.reopened",
            entityType: "work_order",
            entityId: workOrder.id,
            before: {
              status: workOrder.status,
              closedOn: workOrder.closedOn,
              closeReason: workOrder.closeReason,
            },
            after: { status: reopened.status, billId: current.id, reason },
            occurredAt: at,
          });
        }
      }
      await this.audit(tx, access, "contractor_bill.reversed", id, at, {
        before: auditSnapshot(current),
        after: { ...auditSnapshot(after), rowsFreed: freed },
      });
      return after;
    });
  }

  /** The kernel decides only a pending bill (409 `BILL_NOT_PENDING`). */
  private approvalState(bill: StoredBill) {
    if (bill.status !== "pending_approval") throw billNotPending(bill.status);
    return pendingState();
  }
}
