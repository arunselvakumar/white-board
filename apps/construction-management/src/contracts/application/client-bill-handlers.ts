import {
  assertCan,
  can,
  menuByKey,
  type Flag,
  type MemberAccess,
} from "@/src/shared-kernel/access";
import { fromMask } from "@/src/shared-kernel/access/flags";
import { approve, pendingState, reject } from "@/src/shared-kernel/approval";
import type { ApprovalOutcome } from "@/src/shared-kernel/approval-events";
import { recordAudit } from "@/src/shared-kernel/audit";
import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import { boqAmount } from "../domain/boq";
import {
  assertClientDeductions,
  CLIENT_BILL_NAMING,
  clientBillDeductions,
  clientBillGst,
  clientBillHeader,
  clientBillLine,
  clientBillNoMeasurements,
  clientBillNotFound,
  clientBillNotLatest,
  clientBillSettled,
  clientContractChanged,
  clientContractTerms,
  clientRetentionSuggestion,
  DEFAULT_CLIENT_CONTRACT_TERMS,
  GSTIN_NOT_IN_STATE,
  gstinNotInStateMessage,
  lineDeviation,
  projectClientRequired,
  projectNotContractWork,
  projectStateRequired,
  supplierForProject,
  type ClientBillDeduction,
  type ClientBillLineFigures,
  type ClientBillLineInput,
  type ClientContractTerms,
  type ClientContractTermsInput,
  type LineDeviation,
  type SupplierChoice,
} from "../domain/client-bill";
import { contractsProjectNotFound } from "../domain/contracts-errors";
import type { BillStatus } from "../domain/contract-terms";
import {
  assertBillAction,
  billChanged,
  billGrossNotPositive,
  billNet,
  billValues,
  deductionsTotal,
  retentionTotal,
  reverseReason,
  storedBillGst,
  sumRowsBy,
  type BillDeductionInput,
  type BillGst,
  type RetentionSuggestion,
} from "../domain/ra-bill";
import type { StoredBoqItem } from "./boq-ports";
import {
  CLIENT_BILL_DOCUMENT_TYPE,
  CLIENT_BILL_MENU,
  type ClientBillDeps,
  type ClientBillMeasurementRow,
  type StoredClientBill,
  type StoredClientBillLine,
} from "./client-bill-ports";
import type {
  BillCursor,
  BillTotals,
  StoredBillDeduction,
  UnbilledDay,
} from "./contractor-bill-ports";
import type {
  ContractsBillingAddressFacts,
  ContractsClientFacts,
  ContractsProjectFacts,
  ContractsTx,
} from "./ports";
import {
  assertNotStale,
  dispatchBillApproval,
  pendingApproval,
  plannedDeductions,
  raBillSnapshot,
  uniqueIds,
  type DeductionPlan,
} from "./ra-bill-common";

export {
  CLIENT_BILL_DOCUMENT_TYPE,
  CLIENT_BILL_MENU,
} from "./client-bill-ports";

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export type ClientBillCommand = {
  billDate: string;
  measuredUpTo: string;
  remarks?: string | null;
  isFinal?: boolean | null;
  /** Ignored without Financial. Left out: kept (a new draft holds the suggested retention). */
  deductions?: readonly BillDeductionInput[] | null;
};

// ---------------------------------------------------------------------------
// What screens read
// ---------------------------------------------------------------------------

export type ClientBillView = StoredClientBill & {
  clientName: string;
  /** cgst + sgst + igst. */
  gstTotal: bigint;
};

export type ClientBillLineView = StoredClientBillLine & {
  uomName: string;
  /** The BOQ item's current quantity; null when the item was removed. */
  boqQuantity: bigint | null;
  deviation: LineDeviation;
  rows: (ClientBillMeasurementRow & { locationLabel: string | null })[];
};

export type ClientBillAllowed = {
  edit: boolean;
  refresh: boolean;
  delete: boolean;
  submit: boolean;
  approve: boolean;
  reject: boolean;
  reverse: boolean;
  print: boolean;
};

/** Why a Project cannot be billed yet: each with a link to fix it. */
export type ClientBillBlocker =
  | "PROJECT_NOT_CONTRACT_WORK"
  | "PROJECT_CLIENT_REQUIRED"
  | "PROJECT_STATE_REQUIRED";

/** The Project as Client Bills need it. */
export type ClientBillSetup = {
  role: ContractsProjectFacts["role"];
  clientId: string | null;
  clientName: string | null;
  stateCode: string | null;
  /** In this order; empty when bills can be drafted. */
  blockers: ClientBillBlocker[];
};

export type ClientBillDetail = {
  bill: ClientBillView;
  projectName: string;
  client: ContractsClientFacts | null;
  /** The billing address printed as the supplier: the one whose GSTIN the bill stores. */
  supplier: ContractsBillingAddressFacts | null;
  /** `GSTIN_NOT_IN_STATE` when the supplier GSTIN is not in the place of supply's state. */
  warnings: { code: typeof GSTIN_NOT_IN_STATE; message: string }[];
  terms: ClientContractTerms;
  lines: ClientBillLineView[];
  deductions: StoredBillDeduction[];
  supplyType: BillGst["supplyType"];
  payableGst: bigint;
  /** What this bill may hold as retention (also the most it may hold). */
  retention: RetentionSuggestion;
  /** Retention receivable on the Project's approved client bills, this one included when approved. */
  retentionReceivable: bigint;
  allowed: ClientBillAllowed;
  createdByName: string | null;
  submittedByName: string | null;
  decidedByName: string | null;
  reversedByName: string | null;
  financial: boolean;
  viewerFlags: Flag[];
};

export type ClientBillPrint = ClientBillDetail & {
  project: ContractsProjectFacts;
};

export type ClientBillListParams = {
  status?: BillStatus;
  from?: CalendarDate;
  to?: CalendarDate;
  limit: number;
  after?: BillCursor;
  before?: BillCursor;
};

export type ClientBillFormOptions = {
  setup: ClientBillSetup;
  /** Checked client-side rows waiting to be billed, per date measured. */
  unbilled: UnbilledDay[];
  /** A draft or pending client bill already open (one at a time). */
  openBillId: string | null;
  today: CalendarDate;
};

export type ClientContractView = {
  terms: ClientContractTerms;
  /** Null before the terms are first saved. */
  updatedAt: Date | null;
  /** Paise: the BOQ's current value, which the retention cap is a % of. */
  boqValue: bigint;
  /** Retention receivable on the Project's approved client bills. */
  retentionReceivable: bigint;
  canEdit: boolean;
  financial: boolean;
};

type BillableProject = ContractsProjectFacts & {
  clientId: string;
  stateCode: string;
};

type Measured = {
  rows: ClientBillMeasurementRow[];
  lines: ClientBillLineFigures[];
  gross: bigint;
  cumulativeValue: bigint;
  previousValue: bigint;
};

type Priced = {
  gst: BillGst;
  retention: RetentionSuggestion;
  deductions: ClientBillDeduction[];
  net: bigint;
  terms: ClientContractTerms;
  supplier: SupplierChoice;
  client: ContractsClientFacts | null;
  project: BillableProject;
};

function auditSnapshot(bill: StoredClientBill, lineCount?: number) {
  return raBillSnapshot(bill, {
    clientId: bill.clientId,
    placeOfSupplyStateCode: bill.placeOfSupplyStateCode,
    supplierGstin: bill.supplierGstin,
    recipientGstin: bill.recipientGstin,
    ...(lineCount == null ? {} : { lineCount }),
  });
}

/** Why a Project cannot take Client Bills, in the order they are fixed. */
export function clientBillBlockers(
  project: Pick<ContractsProjectFacts, "role" | "clientId" | "stateCode">,
): ClientBillBlocker[] {
  const out: ClientBillBlocker[] = [];
  if (project.role !== "contract") out.push("PROJECT_NOT_CONTRACT_WORK");
  if (project.clientId == null) out.push("PROJECT_CLIENT_REQUIRED");
  if (project.stateCode == null || project.stateCode === "")
    out.push("PROJECT_STATE_REQUIRED");
  return out;
}

/**
 * Client Bills (CM-1107, ADR CM-0023 §7, §11; menu `contracts.client_bills`,
 * CRUDAJPNOF, Project-level): outward RA bills to the Project's Client on
 * the shared engine. Every command takes the Project's BOQ lock first.
 * Approve and Reject use the approval kernel and raise `document.*` events
 * (type `client_bill`); approval creates the receivable invoice to the
 * Client through `PartyInvoicing`. The client contract's terms (retention,
 * cap, DLP, handover, SAC and GST rate) are kept here too.
 */
export class ClientBillHandlers {
  private readonly clock: () => Date;

  constructor(private readonly deps: ClientBillDeps) {
    this.clock = deps.clock ?? (() => new Date());
  }

  // Loading -------------------------------------------------------------------

  async find(workspaceId: string, id: string): Promise<StoredClientBill> {
    const found = await this.deps.store.find(this.deps.db, workspaceId, id);
    if (found == null) throw clientBillNotFound();
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

  /**
   * A Project a Client Bill can be drafted on: Contract work (400
   * `PROJECT_NOT_CONTRACT_WORK`), with a Client (400
   * `PROJECT_CLIENT_REQUIRED`) and a state (400 `PROJECT_STATE_REQUIRED`).
   */
  private async billableProject(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<BillableProject> {
    const project = await this.project(db, workspaceId, projectId);
    if (project.role !== "contract") throw projectNotContractWork();
    if (project.clientId == null) throw projectClientRequired();
    if (project.stateCode == null || project.stateCode === "")
      throw projectStateRequired();
    return {
      ...project,
      clientId: project.clientId,
      stateCode: project.stateCode,
    };
  }

  private async locked(
    tx: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredClientBill> {
    const bill = await this.deps.store.find(tx, workspaceId, id);
    if (bill == null) throw clientBillNotFound();
    return bill;
  }

  viewerFlags(access: MemberAccess, projectId: string): Flag[] {
    const supported = fromMask(menuByKey(CLIENT_BILL_MENU)?.supported ?? 0);
    return supported.filter((flag) =>
      can(access, CLIENT_BILL_MENU, flag, { projectId }),
    );
  }

  financial(access: MemberAccess, projectId: string): boolean {
    return can(access, CLIENT_BILL_MENU, "financial", { projectId });
  }

  /** A draft is changed by its creator (with Create) or a holder of `flag`. */
  private draftEditor(
    access: MemberAccess,
    bill: StoredClientBill,
    flag: "update" | "delete",
  ): boolean {
    const scope = { projectId: bill.projectId };
    return (
      (bill.createdBy === access.userId &&
        can(access, CLIENT_BILL_MENU, "create", scope)) ||
      can(access, CLIENT_BILL_MENU, flag, scope)
    );
  }

  private assertDraftEditor(
    access: MemberAccess,
    bill: StoredClientBill,
    flag: "update" | "delete",
  ): void {
    if (!this.draftEditor(access, bill, flag))
      assertCan(access, CLIENT_BILL_MENU, flag, { projectId: bill.projectId });
  }

  private allowed(
    access: MemberAccess,
    bill: StoredClientBill,
  ): ClientBillAllowed {
    const scope = { projectId: bill.projectId };
    const draft = bill.status === "draft";
    const pending = bill.status === "pending_approval";
    const editor = draft && this.draftEditor(access, bill, "update");
    return {
      edit: editor,
      refresh: editor,
      submit: editor,
      delete: draft && this.draftEditor(access, bill, "delete"),
      approve: pending && can(access, CLIENT_BILL_MENU, "approve", scope),
      reject: pending && can(access, CLIENT_BILL_MENU, "reject", scope),
      reverse:
        bill.status === "approved" &&
        can(access, CLIENT_BILL_MENU, "approve", scope),
      print: can(access, CLIENT_BILL_MENU, "print", scope),
    };
  }

  /** Client names for lists and details. */
  async views(
    db: ContractsTx,
    workspaceId: string,
    bills: readonly StoredClientBill[],
  ): Promise<ClientBillView[]> {
    if (bills.length === 0) return [];
    const clients = await this.deps.directory.clients(
      db,
      workspaceId,
      uniqueIds(bills.map((bill) => bill.clientId)),
    );
    return bills.map((bill) => ({
      ...bill,
      clientName: clients.get(bill.clientId)?.name ?? "",
      gstTotal: bill.cgst + bill.sgst + bill.igst,
    }));
  }

  private async setup(
    db: ContractsTx,
    workspaceId: string,
    project: ContractsProjectFacts,
  ): Promise<ClientBillSetup> {
    const clients =
      project.clientId == null
        ? new Map<string, ContractsClientFacts>()
        : await this.deps.directory.clients(db, workspaceId, [
            project.clientId,
          ]);
    return {
      role: project.role,
      clientId: project.clientId,
      clientName:
        project.clientId == null
          ? null
          : (clients.get(project.clientId)?.name ?? project.clientName),
      stateCode: project.stateCode,
      blockers: clientBillBlockers(project),
    };
  }

  /** The BOQ's current value: Σ round(current quantity × current rate). */
  private async boqValue(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<{ value: bigint; items: StoredBoqItem[] }> {
    const items = await this.deps.boq.items(db, workspaceId, projectId);
    return {
      value: items.reduce(
        (sum, item) => sum + boqAmount(item.quantity, item.rate),
        0n,
      ),
      items,
    };
  }

  // Reads ---------------------------------------------------------------------

  /**
   * The Project's Client Bills, newest first (read), with the totals of the
   * bills the filter matches that count (not rejected or reversed), the
   * retention receivable and what the Project still needs before billing.
   */
  async list(
    access: MemberAccess,
    projectId: string,
    params: ClientBillListParams,
  ): Promise<{
    items: ClientBillView[];
    total: number;
    hasMore: boolean;
    totals: BillTotals;
    retentionReceivable: bigint;
    setup: ClientBillSetup;
    financial: boolean;
    viewerFlags: Flag[];
  }> {
    assertCan(access, CLIENT_BILL_MENU, "read", { projectId });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const project = await this.project(db, ws, projectId);
    const filter = {
      workspaceId: ws,
      projectId,
      status: params.status,
      from: params.from,
      to: params.to,
    };
    const [page, totals, held, setup] = await Promise.all([
      store.list(db, {
        ...filter,
        limit: params.limit,
        after: params.after,
        before: params.before,
      }),
      store.totals(db, filter),
      store.retentionHeld(db, ws, projectId, null),
      this.setup(db, ws, project),
    ]);
    return {
      items: await this.views(db, ws, page.items),
      total: page.total,
      hasMore: page.hasMore,
      totals,
      retentionReceivable: held,
      setup,
      financial: this.financial(access, projectId),
      viewerFlags: this.viewerFlags(access, projectId),
    };
  }

  /** One bill with its lines, the rows behind them, deductions and the tax-invoice facts (read). */
  async get(access: MemberAccess, id: string): Promise<ClientBillDetail> {
    const bill = await this.find(access.workspaceId, id);
    assertCan(access, CLIENT_BILL_MENU, "read", { projectId: bill.projectId });
    return this.detail(access, bill);
  }

  private async detail(
    access: MemberAccess,
    bill: StoredClientBill,
  ): Promise<ClientBillDetail> {
    const { db, store, directory, boq } = this.deps;
    const ws = access.workspaceId;
    const [project, [view], lines, deductions, rows, contract, boqNow] =
      await Promise.all([
        this.project(db, ws, bill.projectId),
        this.views(db, ws, [bill]),
        store.lines(db, ws, [bill.id]),
        store.deductions(db, ws, [bill.id]),
        store.rowsOfBill(db, ws, bill.id),
        store.contract(db, ws, bill.projectId),
        this.boqValue(db, ws, bill.projectId),
      ]);
    if (view == null) throw clientBillNotFound();
    const [uoms, names, heldBefore, clients, addresses, settings, labelOf] =
      await Promise.all([
        directory.uoms(
          db,
          ws,
          lines.map((line) => line.uomId),
        ),
        store.names(
          db,
          ws,
          uniqueIds([
            bill.createdBy,
            bill.submittedBy,
            bill.decidedBy,
            bill.reversedBy,
          ]),
        ),
        store.retentionHeld(db, ws, bill.projectId, bill.id),
        directory.clients(db, ws, [bill.clientId]),
        directory.billingAddresses(db, ws),
        boq.settings(db, ws),
        rows.some((row) => row.location != null)
          ? this.deps.locationLabels(ws, bill.projectId)
          : Promise.resolve(() => null),
      ]);
    const terms = contract?.terms ?? DEFAULT_CLIENT_CONTRACT_TERMS;
    const quantities = new Map(
      boqNow.items.map((item) => [item.id, item.quantity]),
    );
    const retention = clientRetentionSuggestion({
      gross: bill.gross,
      retentionPercent: terms.retentionPercent,
      retentionCapPercent: terms.retentionCapPercent,
      boqValue: boqNow.value,
      heldBefore,
    });
    const gst = storedBillGst(bill);
    const name = (userId: string | null) =>
      userId == null ? null : (names.get(userId) ?? null);
    const supplier =
      addresses.find(
        (row) => row.gstin != null && row.gstin === bill.supplierGstin,
      ) ??
      (bill.supplierGstin == null
        ? (addresses.find((row) => row.isDefault) ?? addresses[0] ?? null)
        : null);
    const place = bill.placeOfSupplyStateCode;
    const warnings =
      place != null && bill.supplierGstin?.slice(0, 2) !== place
        ? [
            {
              code: GSTIN_NOT_IN_STATE,
              message: gstinNotInStateMessage(place),
            },
          ]
        : [];
    return {
      bill: view,
      projectName: project.name,
      client: clients.get(bill.clientId) ?? null,
      supplier,
      warnings,
      terms,
      lines: lines.map((line) => {
        const boqQuantity = quantities.get(line.boqItemId) ?? null;
        return {
          ...line,
          uomName: uoms.get(line.uomId)?.name ?? "",
          boqQuantity,
          deviation: lineDeviation(
            { cumulativeQuantity: line.cumulativeQuantity, boqQuantity },
            settings.deviationLimit,
          ),
          rows: rows
            .filter((row) => row.boqItemId === line.boqItemId)
            .map((row) => ({ ...row, locationLabel: labelOf(row.location) })),
        };
      }),
      deductions,
      supplyType:
        bill.igst > 0n
          ? "inter_state"
          : bill.cgst + bill.sgst > 0n
            ? "intra_state"
            : bill.supplierGstin != null &&
                place != null &&
                bill.supplierGstin.slice(0, 2) !== place
              ? "inter_state"
              : "intra_state",
      payableGst: gst.payable,
      retention,
      retentionReceivable:
        heldBefore +
        (bill.status === "approved" ? retentionTotal(deductions) : 0n),
      allowed: this.allowed(access, bill),
      createdByName: name(bill.createdBy),
      submittedByName: name(bill.submittedBy),
      decidedByName: name(bill.decidedBy),
      reversedByName: name(bill.reversedBy),
      financial: this.financial(access, bill.projectId),
      viewerFlags: this.viewerFlags(access, bill.projectId),
    };
  }

  /** The bill as the tax-invoice PDF prints it (Print). */
  async print(access: MemberAccess, id: string): Promise<ClientBillPrint> {
    const bill = await this.find(access.workspaceId, id);
    assertCan(access, CLIENT_BILL_MENU, "print", {
      projectId: bill.projectId,
    });
    const [detail, project] = await Promise.all([
      this.detail(access, bill),
      this.project(this.deps.db, access.workspaceId, bill.projectId),
    ]);
    return { ...detail, project };
  }

  /**
   * What the "New bill" dialog needs (Create): whether the Project can be
   * billed, the unbilled checked rows per date and any open bill.
   */
  async formOptions(
    access: MemberAccess,
    projectId: string,
  ): Promise<ClientBillFormOptions> {
    assertCan(access, CLIENT_BILL_MENU, "create", { projectId });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    const project = await this.project(db, ws, projectId);
    const [setup, unbilled, openBillId, today] = await Promise.all([
      this.setup(db, ws, project),
      store.unbilledDays(db, ws, projectId),
      store.openBillId(db, ws, projectId),
      this.deps.today(ws),
    ]);
    return { setup, unbilled, openBillId, today };
  }

  /** The retention suggestion for a draft as it stands (read, Financial). */
  async suggestions(
    access: MemberAccess,
    id: string,
  ): Promise<{ retention: RetentionSuggestion; terms: ClientContractTerms }> {
    const detail = await this.get(access, id);
    return { retention: detail.retention, terms: detail.terms };
  }

  // Client contract terms ----------------------------------------------------

  /** The client contract's terms on the Project (read). */
  async contract(
    access: MemberAccess,
    projectId: string,
  ): Promise<ClientContractView> {
    assertCan(access, CLIENT_BILL_MENU, "read", { projectId });
    const { db, store } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const [row, boqNow, held] = await Promise.all([
      store.contract(db, ws, projectId),
      this.boqValue(db, ws, projectId),
      store.retentionHeld(db, ws, projectId, null),
    ]);
    return {
      terms: row?.terms ?? DEFAULT_CLIENT_CONTRACT_TERMS,
      updatedAt: row?.updatedAt ?? null,
      boqValue: boqNow.value,
      retentionReceivable: held,
      canEdit: can(access, CLIENT_BILL_MENU, "update", { projectId }),
      financial: this.financial(access, projectId),
    };
  }

  /**
   * Saves the client contract's terms (Update): retention % and cap,
   * completion release %, DLP months, handover date, SAC and GST rate.
   * They apply to bills drafted or refreshed afterwards; a pending bill
   * keeps what it was drafted with. 409 `CLIENT_CONTRACT_CHANGED` when
   * stale.
   */
  async saveContract(
    access: MemberAccess,
    projectId: string,
    expectedUpdatedAt: Date | null,
    input: ClientContractTermsInput,
  ): Promise<ClientContractView> {
    assertCan(access, CLIENT_BILL_MENU, "update", { projectId });
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    await this.project(db, ws, projectId);
    const terms = clientContractTerms(input);
    const at = this.clock();
    await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, projectId);
      const before = await store.contract(tx, ws, projectId);
      if (
        before != null &&
        before.updatedAt.getTime() !== expectedUpdatedAt?.getTime()
      )
        throw clientContractChanged();
      const saved = await store.saveContract(tx, {
        workspaceId: ws,
        projectId,
        id: before?.id ?? newId(at.getTime()),
        terms,
        expectedUpdatedAt: before?.updatedAt ?? null,
        by: access.userId,
        at,
      });
      if (!saved) throw clientContractChanged();
      await recordAudit(tx, {
        workspaceId: ws,
        actorUserId: access.userId,
        action: "client_contract.updated",
        entityType: "client_contract",
        entityId: before?.id ?? projectId,
        before: before == null ? undefined : termsSnapshot(before.terms),
        after: { projectId, ...termsSnapshot(terms) },
        occurredAt: at,
      });
    });
    return this.contract(access, projectId);
  }

  // Figures -------------------------------------------------------------------

  /**
   * The rows a bill takes and its abstract: every checked client-side row
   * of the Project up to `measuredUpTo` not taken by a bill (the caller
   * frees the bill's own rows first), summed per BOQ item in BOQ order, at
   * the item's current rate, with the previous quantities of approved
   * client bills. Past the BOQ quantity is allowed (a deviation).
   */
  private async measure(
    tx: ContractsTx,
    workspaceId: string,
    projectId: string,
    measuredUpTo: CalendarDate,
  ): Promise<Measured> {
    const { store, boq } = this.deps;
    const rows = await store.billableRows(tx, {
      workspaceId,
      projectId,
      measuredUpTo,
    });
    if (rows.length === 0) throw clientBillNoMeasurements();
    const sums = sumRowsBy(rows, (row) => row.boqItemId);
    const [live, byId, billed] = await Promise.all([
      boq.items(tx, workspaceId, projectId),
      boq.itemsById(tx, workspaceId, [...sums.keys()]),
      store.billedByItem(tx, workspaceId, projectId),
    ]);
    const liveIds = new Set(live.map((item) => item.id));
    const sections = await boq.sectionsById(
      tx,
      workspaceId,
      uniqueIds([...byId.values()].map((item) => item.sectionId)),
    );
    const order = (itemId: string): [number, number] => {
      const item = byId.get(itemId);
      return [
        sections.get(item?.sectionId ?? "")?.position ??
          Number.MAX_SAFE_INTEGER,
        item?.position ?? Number.MAX_SAFE_INTEGER,
      ];
    };
    const inputs: ClientBillLineInput[] = [...sums]
      .sort(([a], [b]) => {
        const [sa, pa] = order(a);
        const [sb, pb] = order(b);
        return sa - sb || pa - pb || a.localeCompare(b);
      })
      .map(([boqItemId, quantity]) => {
        const item = byId.get(boqItemId);
        return {
          boqItemId,
          itemNo: item?.itemNo ?? null,
          description: item?.description ?? "",
          uomId: item?.uomId ?? "",
          rate: item?.rate ?? 0n,
          boqQuantity:
            item != null && liveIds.has(boqItemId) ? item.quantity : null,
          previousQuantity: billed.get(boqItemId) ?? 0n,
          quantity,
        };
      });
    const lines = inputs.map(clientBillLine);
    return { rows, lines, ...billValues(lines) };
  }

  /**
   * GST as a tax invoice (the Company GSTIN for the Project's state, the
   * place of supply the Project's state), the retention suggestion against
   * the BOQ's current value and the deductions by `plan`; the net.
   */
  private async price(
    tx: ContractsTx,
    workspaceId: string,
    project: BillableProject,
    billId: string,
    gross: bigint,
    plan: DeductionPlan<BillDeductionInput>,
    storedGst: BillGst | null,
  ): Promise<Priced> {
    const { directory, store } = this.deps;
    const [contract, boqNow, heldBefore, addresses, clients] =
      await Promise.all([
        store.contract(tx, workspaceId, project.id),
        this.boqValue(tx, workspaceId, project.id),
        store.retentionHeld(tx, workspaceId, project.id, billId),
        directory.billingAddresses(tx, workspaceId),
        directory.clients(tx, workspaceId, [project.clientId]),
      ]);
    const terms = contract?.terms ?? DEFAULT_CLIENT_CONTRACT_TERMS;
    const supplier = supplierForProject(addresses, project.stateCode);
    const gst =
      storedGst ??
      clientBillGst({
        gross,
        gstRate: terms.gstRate,
        supplierStateCode: supplier.stateCode,
        placeOfSupplyStateCode: project.stateCode,
      });
    const suggestionFor = (amount: bigint) =>
      clientRetentionSuggestion({
        gross: amount,
        retentionPercent: terms.retentionPercent,
        retentionCapPercent: terms.retentionCapPercent,
        boqValue: boqNow.value,
        heldBefore,
      });
    const retention = suggestionFor(gross);
    const deductions = plannedDeductions(
      plan,
      retention,
      suggestionFor,
      clientBillDeductions,
    );
    assertClientDeductions({
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
      terms,
      supplier,
      client: clients.get(project.clientId) ?? null,
      project,
    };
  }

  private figures(
    measured: Pick<Measured, "gross" | "cumulativeValue" | "previousValue">,
    priced: Priced,
  ) {
    return {
      cumulativeValue: measured.cumulativeValue,
      previousValue: measured.previousValue,
      gross: measured.gross,
      sacCode: priced.terms.sacCode,
      gstRate: priced.terms.gstRate,
      placeOfSupplyStateCode: priced.project.stateCode,
      supplierGstin: priced.supplier.gstin,
      recipientGstin: priced.client?.gstin ?? null,
      reverseCharge: false,
      cgst: priced.gst.cgst,
      sgst: priced.gst.sgst,
      igst: priced.gst.igst,
      deductionsTotal: deductionsTotal(priced.deductions),
      net: priced.net,
    };
  }

  /** Writes a bill's abstract, deductions and figures. */
  private async write(
    tx: ContractsTx,
    workspaceId: string,
    before: StoredClientBill,
    after: StoredClientBill,
    content: {
      measured: Measured | null;
      deductions: readonly ClientBillDeduction[];
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
          boqItemId: line.boqItemId,
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
      entityType: "client_bill",
      entityId: id,
      ...change,
      occurredAt: at,
    });
  }

  private async dispatch(
    bill: StoredClientBill,
    outcome: ApprovalOutcome,
    by: string,
    at: Date,
  ): Promise<void> {
    await dispatchBillApproval(
      this.deps.events,
      CLIENT_BILL_DOCUMENT_TYPE,
      bill,
      outcome,
      by,
      at,
    );
  }

  // Commands ------------------------------------------------------------------

  /**
   * Drafts a Client Bill on a Contract work Project with a Client and a
   * state (Create): takes every checked client-side row up to "measured
   * up to" not yet billed, and holds the suggested retention unless
   * deductions are sent (with Financial). 409 `BILL_OPEN_EXISTS` while
   * another client bill on the Project is draft or pending.
   */
  async create(
    access: MemberAccess,
    projectId: string,
    input: ClientBillCommand,
  ): Promise<StoredClientBill> {
    assertCan(access, CLIENT_BILL_MENU, "create", { projectId });
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    await this.billableProject(db, ws, projectId);
    const [check, today] = await Promise.all([
      this.deps.backdated(access),
      this.deps.today(ws),
    ]);
    const financial = this.financial(access, projectId);
    const header = clientBillHeader(input, { today });
    check("client_bill", "create", header.billDate);
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, projectId);
      const project = await this.billableProject(tx, ws, projectId);
      const draft: StoredClientBill = {
        id: newId(at.getTime()),
        workspaceId: ws,
        projectId,
        clientId: project.clientId,
        number: null,
        ordinal: null,
        ...header,
        status: "draft",
        cumulativeValue: 0n,
        previousValue: 0n,
        gross: 0n,
        sacCode: null,
        gstRate: null,
        placeOfSupplyStateCode: project.stateCode,
        supplierGstin: null,
        recipientGstin: null,
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
        projectId,
        header.measuredUpTo,
      );
      const priced = await this.price(
        tx,
        ws,
        project,
        draft.id,
        measured.gross,
        financial && input.deductions != null
          ? { kind: "given", inputs: input.deductions }
          : { kind: "suggest" },
        null,
      );
      const after: StoredClientBill = {
        ...draft,
        ...this.figures(measured, priced),
      };
      await this.write(
        tx,
        ws,
        draft,
        after,
        { measured, deductions: priced.deductions },
        at,
      );
      await this.audit(tx, access, "client_bill.created", draft.id, at, {
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
    input: ClientBillCommand,
  ): Promise<StoredClientBill> {
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
      assertNotStale(current, expectedUpdatedAt);
      const header = clientBillHeader(input, { today });
      check("client_bill", "edit", current.billDate);
      if (header.billDate !== current.billDate)
        check("client_bill", "edit", header.billDate);
      const remeasure = header.measuredUpTo !== current.measuredUpTo;
      const project = await this.billableProject(tx, ws, current.projectId);
      const stored = await store.deductions(tx, ws, [id]);
      let measured: Measured | null = null;
      if (remeasure) {
        await store.freeRows(tx, ws, id);
        measured = await this.measure(
          tx,
          ws,
          current.projectId,
          header.measuredUpTo,
        );
      }
      const gross = measured?.gross ?? current.gross;
      const priced = await this.price(
        tx,
        ws,
        project,
        id,
        gross,
        financial && input.deductions != null
          ? { kind: "given", inputs: input.deductions }
          : { kind: "keep", stored, previousGross: current.gross },
        measured == null ? storedBillGst(current) : null,
      );
      const after: StoredClientBill = {
        ...current,
        ...header,
        ...this.figures(measured ?? current, priced),
        ...(measured == null
          ? {
              sacCode: current.sacCode,
              gstRate: current.gstRate,
              placeOfSupplyStateCode: current.placeOfSupplyStateCode,
              supplierGstin: current.supplierGstin,
              recipientGstin: current.recipientGstin,
            }
          : { clientId: project.clientId }),
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
      await this.audit(tx, access, "client_bill.updated", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      return after;
    });
  }

  /**
   * Takes a draft's rows again (its creator with Create, or Update): rows
   * checked since, up to its date or a new one, at the BOQ's rates, the
   * client contract's terms, the Company GSTIN and the Client now.
   */
  async refresh(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
    measuredUpTo: string | null,
  ): Promise<StoredClientBill> {
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
      assertNotStale(current, expectedUpdatedAt);
      const project = await this.billableProject(tx, ws, current.projectId);
      const header = clientBillHeader(
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
        { today },
      );
      const stored = await store.deductions(tx, ws, [id]);
      await store.freeRows(tx, ws, id);
      const measured = await this.measure(
        tx,
        ws,
        current.projectId,
        header.measuredUpTo,
      );
      const priced = await this.price(
        tx,
        ws,
        project,
        id,
        measured.gross,
        { kind: "keep", stored, previousGross: current.gross },
        null,
      );
      const after: StoredClientBill = {
        ...current,
        clientId: project.clientId,
        measuredUpTo: header.measuredUpTo,
        ...this.figures(measured, priced),
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
      await this.audit(tx, access, "client_bill.refreshed", id, at, {
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
      assertNotStale(current, expectedUpdatedAt);
      const freed = await store.freeRows(tx, ws, id);
      const deleted = await store.delete(tx, {
        bill: current,
        expectedUpdatedAt,
        by: access.userId,
        at,
      });
      if (!deleted) throw billChanged();
      await this.audit(tx, access, "client_bill.deleted", id, at, {
        before: { ...auditSnapshot(current), rowsFreed: freed },
      });
    });
  }

  /**
   * Sends a draft for approval (its creator with Create, or Update). The
   * first submission takes its number from the `client_bill` sequence
   * rule, dated the bill date, and its ordinal on the Project's client
   * side. The gross must be more than ₹0.
   */
  async submit(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredClientBill> {
    const before = await this.find(access.workspaceId, id);
    this.assertDraftEditor(access, before, "update");
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const submitted = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      assertBillAction(current.status, "submit");
      assertNotStale(current, expectedUpdatedAt);
      if (current.gross <= 0n) throw billGrossNotPositive();
      const number =
        current.number ??
        (
          await nextSequenceNumber(tx, {
            workspaceId: ws,
            module: "client_bill",
            projectId: current.projectId,
            date: current.billDate,
            by: access.userId,
          })
        ).number;
      const ordinal = (await store.maxOrdinal(tx, ws, current.projectId)) + 1;
      const pending = pendingState();
      const after: StoredClientBill = {
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
      await this.audit(tx, access, "client_bill.submitted", id, at, {
        before: auditSnapshot(current),
        after: auditSnapshot(after),
      });
      return after;
    });
    await this.dispatch(submitted, { kind: "submitted" }, access.userId, at);
    return submitted;
  }

  /**
   * Approves a pending bill (Approve; 409 `BILL_NOT_PENDING`): the
   * receivable invoice to the Client is created in finance (origin
   * `ra_bill`, number and date the bill's, taxable = gross, GST = the
   * bill's, amount = net; none when the net is ₹0). A Final bill marks the
   * contract's final bill: nothing closes.
   */
  async approve(
    access: MemberAccess,
    id: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredClientBill> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, CLIENT_BILL_MENU, "approve", {
      projectId: before.projectId,
    });
    const { db, store, boq, invoicing } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const decided = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      const state = approve(
        pendingApproval(current.status),
        { userId: access.userId, at },
        CLIENT_BILL_NAMING,
      );
      assertNotStale(current, expectedUpdatedAt);
      const invoiceId =
        current.net > 0n && current.number != null
          ? await invoicing.create(tx, {
              workspaceId: ws,
              by: access.userId,
              partyType: "client",
              partyId: current.clientId,
              projectId: current.projectId,
              departmentId: null,
              direction: "receivable",
              number: current.number,
              date: current.billDate,
              taxable: current.gross,
              gst: current.cgst + current.sgst + current.igst,
              amount: current.net,
              sourceId: current.id,
            })
          : null;
      const after: StoredClientBill = {
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
      await this.audit(tx, access, "client_bill.approved", id, at, {
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
  ): Promise<StoredClientBill> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, CLIENT_BILL_MENU, "reject", {
      projectId: before.projectId,
    });
    const { db, store, boq } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    const decided = await db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      const state = reject(
        pendingApproval(current.status),
        { userId: access.userId, at },
        reason,
        CLIENT_BILL_NAMING,
      );
      assertNotStale(current, expectedUpdatedAt);
      const freed = await store.freeRows(tx, ws, id);
      const after: StoredClientBill = {
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
      await this.audit(tx, access, "client_bill.rejected", id, at, {
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
   * the Project's client side with no later bill open (409
   * `BILL_NOT_LATEST`) and nothing received or written off against its
   * invoice (409 `BILL_SETTLED`). The invoice is reversed in finance and
   * the rows are freed.
   */
  async reverse(
    access: MemberAccess,
    id: string,
    rawReason: string,
    expectedUpdatedAt: Date | null,
  ): Promise<StoredClientBill> {
    const before = await this.find(access.workspaceId, id);
    assertCan(access, CLIENT_BILL_MENU, "approve", {
      projectId: before.projectId,
    });
    const reason = reverseReason(rawReason);
    const { db, store, boq, invoicing } = this.deps;
    const ws = access.workspaceId;
    const at = this.clock();
    return db.$transaction(async (tx) => {
      await boq.lock(tx, ws, before.projectId);
      const current = await this.locked(tx, ws, id);
      assertBillAction(current.status, "reverse");
      assertNotStale(current, expectedUpdatedAt);
      if ((await store.laterBills(tx, ws, current)) > 0)
        throw clientBillNotLatest();
      if (
        current.invoiceId != null &&
        (await invoicing.isSettled(tx, {
          workspaceId: ws,
          invoiceId: current.invoiceId,
        }))
      )
        throw clientBillSettled();
      if (current.invoiceId != null)
        await invoicing.reverse(tx, {
          workspaceId: ws,
          by: access.userId,
          invoiceId: current.invoiceId,
          reason,
        });
      const freed = await store.freeRows(tx, ws, id);
      const after: StoredClientBill = {
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
      await this.audit(tx, access, "client_bill.reversed", id, at, {
        before: auditSnapshot(current),
        after: { ...auditSnapshot(after), rowsFreed: freed },
      });
      return after;
    });
  }
}

function termsSnapshot(terms: ClientContractTerms) {
  const pct = (value: bigint | null) =>
    value == null ? null : Number(value) / 100;
  return {
    retentionPercent: pct(terms.retentionPercent),
    retentionCapPercent: pct(terms.retentionCapPercent),
    retentionCompletionPercent: pct(terms.retentionCompletionPercent),
    dlpMonths: terms.dlpMonths,
    handoverOn: terms.handoverOn,
    sacCode: terms.sacCode,
    gstRate: pct(terms.gstRate),
  };
}
