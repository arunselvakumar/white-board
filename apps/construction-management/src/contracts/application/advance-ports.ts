import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type {
  AdvanceDirection,
  AdvanceKind,
  GuaranteePurpose,
  RecoveryMode,
  RetentionStage,
} from "../domain/contract-terms";
import type { BoqDb, BoqStore } from "./boq-ports";
import type { ClientBillStore } from "./client-bill-ports";
import type {
  AdvancePayments,
  ContractsDirectory,
  ContractsTx,
  PartyInvoicing,
} from "./ports";
import type { WorkOrderStore } from "./work-order-ports";

/**
 * What advances, bank guarantees and retention releases keep (CM-1108,
 * ADR CM-0023 §8), and the store that keeps them (Prisma in
 * `infrastructure/prisma-advance-store.ts`). Every command runs in one
 * transaction that first takes the Project's BOQ lock (the lock bills
 * take), so a recovery, a release and a bill's approval or reversal never
 * cross: what is recovered, held and released is read committed.
 */

/** One side of a contract: a Work Order (contractor) or the Project's client contract. */
export type ContractRef =
  | { side: "contractor"; projectId: string; workOrderId: string }
  | { side: "client"; projectId: string };

export type StoredAdvance = {
  id: string;
  workspaceId: string;
  projectId: string;
  direction: AdvanceDirection;
  kind: AdvanceKind;
  /** `given` only. */
  workOrderId: string | null;
  /** `received` only. */
  clientId: string | null;
  /** Paise. */
  amount: bigint;
  advanceOn: CalendarDate;
  recoveryMode: RecoveryMode;
  /** `percent`: hundredths of a percent; `fixed`: paise per bill. */
  recoveryValue: bigint;
  /** The finance payment (given) or receipt (received). */
  paymentId: string | null;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredGuarantee = {
  id: string;
  workspaceId: string;
  projectId: string;
  side: "contractor" | "client";
  purpose: GuaranteePurpose;
  workOrderId: string | null;
  advanceId: string | null;
  number: string;
  bank: string;
  amount: bigint;
  issuedOn: CalendarDate | null;
  expiresOn: CalendarDate;
  releasedOn: CalendarDate | null;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredRelease = {
  id: string;
  workspaceId: string;
  projectId: string;
  side: "contractor" | "client";
  workOrderId: string | null;
  clientId: string | null;
  stage: RetentionStage;
  amount: bigint;
  releasedOn: CalendarDate;
  reason: string | null;
  bankGuaranteeId: string | null;
  invoiceId: string | null;
  createdAt: Date;
  createdBy: string;
};

/** A bank guarantee or DLP end inside the notice window, for the daily notice. */
export type DueSoonItem = {
  workspaceId: string;
  projectId: string;
  side: "contractor" | "client";
  kind: "guarantee" | "dlp";
  /** "BG 123 (State Bank of India)", "WO/26-27/00001". */
  label: string;
  workOrderId: string | null;
  date: CalendarDate;
};

export type AdvanceStore = {
  // Advances ------------------------------------------------------------------
  /** Live advances of the contract, oldest first. */
  advances(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<StoredAdvance[]>;
  findAdvance(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredAdvance | null>;
  insertAdvance(tx: ContractsTx, row: StoredAdvance): Promise<void>;
  /** False when `updatedAt` is not `expectedUpdatedAt`. */
  updateAdvance(
    tx: ContractsTx,
    row: StoredAdvance,
    expectedUpdatedAt: Date,
  ): Promise<boolean>;
  deleteAdvance(
    tx: ContractsTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  /**
   * Σ recovery deductions naming each advance on live **approved** bills,
   * `exceptBillId` left out.
   */
  recovered(
    db: ContractsTx,
    workspaceId: string,
    advanceIds: readonly string[],
    exceptBillId: string | null,
  ): Promise<Map<string, bigint>>;
  /** Live bills (not rejected or reversed) with a deduction naming the advance. */
  billsRecovering(
    db: ContractsTx,
    workspaceId: string,
    advanceId: string,
  ): Promise<number>;

  // Bank guarantees -----------------------------------------------------------
  /** Live guarantees of the contract, by expiry. */
  guarantees(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<StoredGuarantee[]>;
  findGuarantee(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredGuarantee | null>;
  insertGuarantee(tx: ContractsTx, row: StoredGuarantee): Promise<void>;
  updateGuarantee(
    tx: ContractsTx,
    row: StoredGuarantee,
    expectedUpdatedAt: Date,
  ): Promise<boolean>;
  deleteGuarantee(
    tx: ContractsTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  /** Live releases against the guarantee. */
  releasesAgainst(
    db: ContractsTx,
    workspaceId: string,
    guaranteeId: string,
  ): Promise<number>;
  /** Live guarantees securing the advance. */
  guaranteesOfAdvance(
    db: ContractsTx,
    workspaceId: string,
    advanceId: string,
  ): Promise<number>;

  // Retention -----------------------------------------------------------------
  /** Σ retention deducted on the contract's live approved running bills. */
  retentionDeducted(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<bigint>;
  /** Live releases of the contract, newest first. */
  releases(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<StoredRelease[]>;
  /** Σ live releases of the contract. */
  releasedTotal(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<bigint>;
  /** Σ live contractor-side releases on the Project per Contractor (their Work Orders'). */
  releasedByContractor(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<Map<string, bigint>>;
  /** Every release ever made on the contract, deleted ones included (for numbering). */
  releaseCount(
    db: ContractsTx,
    workspaceId: string,
    contract: ContractRef,
  ): Promise<number>;
  findRelease(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredRelease | null>;
  insertRelease(tx: ContractsTx, row: StoredRelease): Promise<void>;
  deleteRelease(
    tx: ContractsTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;

  // The daily notice -------------------------------------------------------------
  /**
   * Live, unreleased bank guarantees expiring and DLPs ending between the
   * two dates, across Companies (each item carries its workspace), for
   * Work Orders not cancelled and client contracts with a handover date.
   */
  dueBetween(
    db: ContractsTx,
    range: { from: CalendarDate; to: CalendarDate },
  ): Promise<DueSoonItem[]>;
};

export type AdvanceDeps = {
  db: BoqDb;
  store: AdvanceStore;
  /** The Project's BOQ lock. */
  boq: BoqStore;
  /** The Work Order: its terms, Contractor, Department and completion date. */
  workOrders: WorkOrderStore;
  /** The client contract's terms (retention release %, DLP, handover). */
  clientBills: ClientBillStore;
  directory: ContractsDirectory;
  /** Release invoices and invoice states (finance). */
  invoicing: PartyInvoicing;
  /** The advance's payment or receipt (finance). */
  payments: AdvancePayments;
  /** The Company's today. */
  today: (workspaceId: string) => Promise<CalendarDate>;
  clock?: () => Date;
};
