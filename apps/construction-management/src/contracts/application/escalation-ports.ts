import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { EventDispatcher } from "@/src/shared-kernel/events";

import type { EscalationComponent } from "../domain/contract-terms";
import type {
  EscalationClauseTerms,
  EscalationTakenBill,
  EscalationWorking,
} from "../domain/escalation";
import type { ContractRef } from "./advance-ports";
import type { BoqDb, BoqStore } from "./boq-ports";
import type { ClientBillStore } from "./client-bill-ports";
import type {
  ContractorBillStore,
  StoredBill,
  StoredBillDeduction,
} from "./contractor-bill-ports";
import type { ContractsDirectory, ContractsTx, PartyInvoicing } from "./ports";
import type { WorkOrderStore } from "./work-order-ports";

/**
 * Price indices, escalation clauses and escalation bills (CM-1109, ADR
 * CM-0023 §9), and the stores that keep them (Prisma in
 * `infrastructure/prisma-escalation-store.ts`). An escalation bill is a
 * `bills` row of type `escalation` on either side: it has no lines and
 * takes no measurements; its `working` JSON holds the 10CC / 10CA working.
 * Every clause and bill command takes the Project's BOQ lock, as RA bills
 * do, so the running bills it reads and the bills that reverse cannot
 * cross.
 */

/** Price indices are a Company-level contracts master, under the Item Library's menu. */
export const PRICE_INDEX_MENU = "contracts.items";

/** The approval document types messaging links to escalation bills. */
export const ESCALATION_DOCUMENT_TYPES = {
  contractor: "contractor_escalation_bill",
  client: "client_escalation_bill",
} as const;

// ---------------------------------------------------------------------------
// Price indices
// ---------------------------------------------------------------------------

export type StoredPriceIndex = {
  id: string;
  workspaceId: string;
  series: string;
  /** The first day of the month. */
  month: CalendarDate;
  /** Ten-thousandths. */
  value: bigint;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type PriceIndexStore = {
  /** Every index of the Company, by series then month; at most `limit`. */
  list(
    db: ContractsTx,
    workspaceId: string,
    limit: number,
  ): Promise<StoredPriceIndex[]>;
  find(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredPriceIndex | null>;
  /** The distinct series names the Company keeps. */
  seriesNames(db: ContractsTx, workspaceId: string): Promise<string[]>;
  /** The indices of these months, every series. */
  inMonths(
    db: ContractsTx,
    workspaceId: string,
    months: readonly CalendarDate[],
  ): Promise<StoredPriceIndex[]>;
  /** 409 `PRICE_INDEX_EXISTS` from the unique (series, month). */
  insert(tx: ContractsTx, row: StoredPriceIndex): Promise<void>;
  /** False when `updatedAt` is not `expectedUpdatedAt` (when given). */
  update(
    tx: ContractsTx,
    row: StoredPriceIndex,
    expectedUpdatedAt: Date | null,
  ): Promise<boolean>;
  delete(tx: ContractsTx, workspaceId: string, id: string): Promise<boolean>;
  insertMany(tx: ContractsTx, rows: readonly StoredPriceIndex[]): Promise<void>;
};

// ---------------------------------------------------------------------------
// Clauses
// ---------------------------------------------------------------------------

export type StoredEscalationClause = {
  id: string;
  workspaceId: string;
  projectId: string;
  side: "contractor" | "client";
  workOrderId: string | null;
  terms: EscalationClauseTerms;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type EscalationClauseStore = {
  forContract(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<StoredEscalationClause | null>;
  find(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredEscalationClause | null>;
  /** 409 `ESCALATION_CLAUSE_EXISTS` from the partial unique indexes. */
  insert(tx: ContractsTx, clause: StoredEscalationClause): Promise<void>;
  /** Replaces the terms and components; false when stale. */
  update(
    tx: ContractsTx,
    clause: StoredEscalationClause,
    expectedUpdatedAt: Date,
  ): Promise<boolean>;
  delete(
    tx: ContractsTx,
    input: {
      clause: StoredEscalationClause;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
};

// ---------------------------------------------------------------------------
// Escalation bills
// ---------------------------------------------------------------------------

export type StoredEscalationBill = Omit<StoredBill, "workOrderId"> & {
  side: "contractor" | "client";
  /** Contractor side. */
  workOrderId: string | null;
  /** Client side: the Project's Client when drafted. */
  clientId: string | null;
  recipientGstin: string | null;
  periodFrom: CalendarDate;
  periodTo: CalendarDate;
  working: EscalationWorking;
};

/** An escalation bill as another bill's check sees it. */
export type EscalationBillRef = {
  id: string;
  number: string | null;
  status: StoredBill["status"];
  periodFrom: CalendarDate;
  periodTo: CalendarDate;
  gross: bigint;
};

export type EscalationBillStore = {
  find(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredEscalationBill | null>;
  /** Live escalation bills on the contract, newest first. */
  ofContract(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<EscalationBillRef[]>;
  /**
   * The side's approved, unreversed running bills on the contract dated
   * from `from` to `to`, in date order: R's bills.
   */
  runningBillsIn(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
    period: { from: CalendarDate; to: CalendarDate },
  ): Promise<EscalationTakenBill[]>;
  /** Escalation bills (live, not rejected or reversed) whose working takes `billId`. */
  takingBill(
    db: ContractsTx,
    workspaceId: string,
    billId: string,
  ): Promise<EscalationBillRef[]>;
  /** 409 `BILL_NUMBER_TAKEN` from the live-number index. */
  insert(tx: ContractsTx, bill: StoredEscalationBill): Promise<void>;
  update(
    tx: ContractsTx,
    after: StoredEscalationBill,
    expectedUpdatedAt: Date,
  ): Promise<boolean>;
  deductions(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ): Promise<StoredBillDeduction[]>;
  replaceDeductions(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    deductions: readonly StoredBillDeduction[],
  ): Promise<void>;
  delete(
    tx: ContractsTx,
    input: {
      bill: StoredEscalationBill;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
  /** The highest escalation ordinal on the contract among bills that count. */
  maxOrdinal(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<number>;
  /** Approved escalation bills on the contract with a higher ordinal. */
  laterApproved(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
    bill: { id: string; ordinal: number | null },
  ): Promise<number>;
  /** Approved, unreversed escalation bills on the contract. */
  approvedCount(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<number>;
  /**
   * Σ recovery deductions naming each escalation bill on live bills that
   * count (draft, pending, approved), leaving out `exceptBillId`; and the
   * approved ones apart.
   */
  recoveredByEscalation(
    db: ContractsTx,
    workspaceId: string,
    escalationBillIds: readonly string[],
    exceptBillId: string | null,
  ): Promise<Map<string, { live: bigint; approved: bigint; count: number }>>;
  names(
    db: ContractsTx,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

/**
 * The CM-1110 hook: cement and steel quantities used in a period, from
 * material reconciliation. Until CM-1110 it answers nothing and the
 * quantities are typed on the draft.
 */
export type EscalationMaterialQuantities = (
  db: ContractsTx,
  input: {
    workspaceId: string;
    contract: ContractRef;
    period: { from: CalendarDate; to: CalendarDate };
  },
) => Promise<Map<EscalationComponent, bigint>>;

export type EscalationDeps = {
  db: BoqDb;
  indices: PriceIndexStore;
  clauses: EscalationClauseStore;
  bills: EscalationBillStore;
  /** The Project's BOQ lock. */
  boq: BoqStore;
  workOrders: WorkOrderStore;
  /** Retention held on a Work Order's approved bills (both types). */
  contractorBills: Pick<ContractorBillStore, "retentionHeld">;
  /** The client contract's terms and the retention it holds (both types). */
  clientBills: Pick<ClientBillStore, "contract" | "retentionHeld">;
  directory: ContractsDirectory;
  invoicing: PartyInvoicing;
  materialQuantities: EscalationMaterialQuantities;
  backdated: (access: {
    workspaceId: string;
    userId: string;
    role: "owner" | "member";
  }) => Promise<
    (
      module: "contractor_bill" | "client_bill",
      action: "create" | "edit",
      date: CalendarDate,
    ) => void
  >;
  today: (workspaceId: string) => Promise<CalendarDate>;
  events: EventDispatcher;
  clock?: () => Date;
};
