import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import type { BillStatus, DeductionKind } from "../domain/contract-terms";
import type { AdvanceStore } from "./advance-ports";
import type { BoqDb, BoqStore } from "./boq-ports";
import type { ContractsDirectory, ContractsTx, PartyInvoicing } from "./ports";
import type { WorkOrderStore } from "./work-order-ports";

/**
 * What Contractor Bills keep (CM-1106), and the store that keeps them
 * (Prisma in `infrastructure/prisma-contractor-bill-store.ts`). Every
 * command runs in one transaction that first takes the Project's BOQ lock
 * (the lock the BOQ, Work Orders and the Measurement Book take), so a bill
 * taking rows and a sheet being checked, reopened or deleted, or a Work
 * Order being amended or closed, never cross.
 */

export const CONTRACTOR_BILL_MENU = "contracts.contractor_bills";

/** The approval document type messaging links to Contractor Bills (`APPROVAL_DOCUMENTS`). */
export const CONTRACTOR_BILL_DOCUMENT_TYPE = "contractor_bill";

export type StoredBill = {
  id: string;
  workspaceId: string;
  projectId: string;
  workOrderId: string;
  /** Null until first submitted. */
  number: string | null;
  /** The running bill's place on its Work Order; null until submitted. */
  ordinal: number | null;
  billDate: CalendarDate;
  measuredUpTo: CalendarDate;
  isFinal: boolean;
  status: BillStatus;
  /** Paise. */
  cumulativeValue: bigint;
  previousValue: bigint;
  gross: bigint;
  sacCode: string | null;
  /** Hundredths of a percent, from the Work Order's terms. */
  gstRate: bigint | null;
  /** The Project's state (works on immovable property). */
  placeOfSupplyStateCode: string | null;
  supplierGstin: string | null;
  reverseCharge: boolean;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  deductionsTotal: bigint;
  net: bigint;
  remarks: string | null;
  /** The payable invoice the approval created in finance. */
  invoiceId: string | null;
  submittedAt: Date | null;
  submittedBy: string | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  rejectReason: string | null;
  reversedAt: Date | null;
  reversedBy: string | null;
  reverseReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredBillLine = {
  id: string;
  billId: string;
  workOrderLineId: string;
  itemNo: string | null;
  description: string;
  uomId: string;
  /** Paise per UoM: the Work Order line's rate when drafted or refreshed. */
  rate: bigint;
  /** Ten-thousandths. */
  cumulativeQuantity: bigint;
  previousQuantity: bigint;
  quantity: bigint;
  /** Paise: round(cumulative × rate) − round(previous × rate). */
  amount: bigint;
  position: number;
};

export type StoredBillDeduction = {
  id: string;
  billId: string;
  kind: DeductionKind;
  description: string | null;
  amount: bigint;
  /** CM-1108: the advance a recovery recovers. */
  advanceId: string | null;
  position: number;
};

/** A checked contractor-side measurement row, with its sheet's date. */
export type BillMeasurementRow = {
  id: string;
  sheetId: string;
  measuredOn: CalendarDate;
  sheetTitle: string | null;
  workOrderLineId: string;
  description: string | null;
  location: LocationRef | null;
  /** Ten-thousandths; null when blank (or a direct row). */
  nos: bigint | null;
  length: bigint | null;
  breadth: bigint | null;
  depth: bigint | null;
  direct: boolean;
  /** Ten-thousandths; negative for a deduction. */
  quantity: bigint;
  position: number;
};

/** A list position: newest first (root ADR-0020). */
export type BillCursor = { createdAt: Date; id: string };

export type BillFilter = {
  workspaceId: string;
  projectId: string;
  status?: BillStatus;
  workOrderId?: string;
  contractorId?: string;
  /** Bill date on or after. */
  from?: CalendarDate;
  /** Bill date on or before. */
  to?: CalendarDate;
};

/** Paise over the bills a filter matches that count (not rejected or reversed). */
export type BillTotals = {
  count: number;
  gross: bigint;
  gst: bigint;
  deductions: bigint;
  net: bigint;
};

/** Checked rows waiting to be billed on one date. */
export type UnbilledDay = { measuredOn: CalendarDate; rows: number };

export type ContractorBillStore = {
  list(
    db: ContractsTx,
    params: BillFilter & {
      limit: number;
      after?: BillCursor;
      before?: BillCursor;
    },
  ): Promise<{ items: StoredBill[]; total: number; hasMore: boolean }>;
  totals(db: ContractsTx, filter: BillFilter): Promise<BillTotals>;
  find(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredBill | null>;
  /** Lines of these bills, in bill then position order. */
  lines(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ): Promise<StoredBillLine[]>;
  /** Deductions of these bills, in bill then position order. */
  deductions(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ): Promise<StoredBillDeduction[]>;
  /**
   * Inserts the bill; 409 `BILL_OPEN_EXISTS` (one draft or pending
   * running bill per Work Order) or `BILL_NUMBER_TAKEN` from the partial
   * unique indexes.
   */
  insert(tx: ContractsTx, bill: StoredBill): Promise<void>;
  /** Writes every field; false when `updatedAt` is not `expectedUpdatedAt`. */
  update(
    tx: ContractsTx,
    after: StoredBill,
    expectedUpdatedAt: Date,
  ): Promise<boolean>;
  replaceLines(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    lines: readonly StoredBillLine[],
  ): Promise<void>;
  replaceDeductions(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    deductions: readonly StoredBillDeduction[],
  ): Promise<void>;
  /** A tombstone; false when `updatedAt` is not `expectedUpdatedAt` (when given). */
  delete(
    tx: ContractsTx,
    input: {
      bill: StoredBill;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
  /**
   * Rows a bill on the Work Order may take: on its live, checked
   * contractor-side sheets measured on or before `measuredUpTo`, naming
   * one of its lines, and not taken by any bill.
   */
  billableRows(
    db: ContractsTx,
    input: {
      workspaceId: string;
      workOrderId: string;
      measuredUpTo: CalendarDate;
    },
  ): Promise<BillMeasurementRow[]>;
  /** Unbilled checked rows of these Work Orders, counted per date measured. */
  unbilledDays(
    db: ContractsTx,
    workspaceId: string,
    workOrderIds: readonly string[],
  ): Promise<Map<string, UnbilledDay[]>>;
  /** The rows a bill took, in date, sheet and position order. */
  rowsOfBill(
    db: ContractsTx,
    workspaceId: string,
    billId: string,
  ): Promise<BillMeasurementRow[]>;
  /** Sets `bill_id` on these rows. */
  takeRows(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    rowIds: readonly string[],
  ): Promise<void>;
  /** Clears `bill_id` on every row the bill took; returns how many. */
  freeRows(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
  ): Promise<number>;
  /**
   * Paise of retention on the Work Order's approved bills (reversed and
   * rejected ones do not count), leaving out `exceptBillId`.
   */
  retentionHeld(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
    exceptBillId: string | null,
  ): Promise<bigint>;
  /** Paise of retention held on the Project's approved bills, by Contractor. */
  retentionHeldByContractor(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<Map<string, bigint>>;
  /** The highest ordinal among the Work Order's live bills that count. */
  maxOrdinal(
    db: ContractsTx,
    workspaceId: string,
    workOrderId: string,
  ): Promise<number>;
  /**
   * Live bills on the Work Order, other than `bill`, that are open (draft
   * or pending) or approved with a higher ordinal.
   */
  laterBills(
    db: ContractsTx,
    workspaceId: string,
    bill: Pick<StoredBill, "id" | "workOrderId" | "ordinal">,
  ): Promise<number>;
  /** Bills by Work Order, live and not rejected or reversed: for the Work Order page. */
  countsByWorkOrder(
    db: ContractsTx,
    workspaceId: string,
    workOrderIds: readonly string[],
  ): Promise<Map<string, number>>;
  /** "Who did this" names by User id. */
  names(
    db: ContractsTx,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

/** Checks one date against the Back-dated Entry policy (`loadBackdatedCheck`). */
export type ContractorBillBackdatedCheck = (
  module: "contractor_bill",
  action: "create" | "edit",
  date: CalendarDate,
) => void;

/**
 * The TDS a payment of this bill would likely suffer (ADR CM-0023 §7:
 * shown for information; finance deducts TDS at payment, CM-0017 §8).
 */
export type ContractorTdsEstimate = {
  /** What to print: `194C`, or `393 (194C)` from 1 April 2026. */
  label: string;
  /** Percent as a decimal string. */
  rate: string;
  /** The Contractor's TDS settings say TDS applies. */
  applicable: boolean;
  /** Paise: the base (the gross, before GST). */
  base: bigint;
  /** Paise, rounded to the rupee. */
  amount: bigint;
};

/** Implemented over finance's TDS table in `src/composition`. */
export type ContractorTdsEstimator = (
  db: ContractsTx,
  input: {
    workspaceId: string;
    contractorId: string;
    date: CalendarDate;
    base: bigint;
  },
) => Promise<ContractorTdsEstimate | null>;

export type ContractorBillDeps = {
  db: BoqDb;
  store: ContractorBillStore;
  /** The Project's BOQ lock. */
  boq: BoqStore;
  /** The Work Order, its lines, what is billed, and its close on a Final bill. */
  workOrders: WorkOrderStore;
  directory: ContractsDirectory;
  /** The payable invoice in finance (ADR CM-0023 §7). */
  invoicing: PartyInvoicing;
  /** The Work Order's advances and retention releases (CM-1108). */
  advances: AdvanceStore;
  tds: ContractorTdsEstimator;
  /** One-line labels for the rows' locations ("Wing A · Floor 1"). */
  locationLabels: (
    workspaceId: string,
    projectId: string,
  ) => Promise<(location: LocationRef | null) => string | null>;
  backdated: (access: {
    workspaceId: string;
    userId: string;
    role: "owner" | "member";
  }) => Promise<ContractorBillBackdatedCheck>;
  /** The Company's today: no bill dated after it. */
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** `document.submitted|approved|rejected` (type `contractor_bill`), after commit. */
  events: EventDispatcher;
  clock?: () => Date;
};
