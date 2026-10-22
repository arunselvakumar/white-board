import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import type { BillStatus } from "../domain/contract-terms";
import type { ClientContractTerms } from "../domain/client-bill";
import type { AdvanceStore } from "./advance-ports";
import type { BoqDb, BoqStore } from "./boq-ports";
import type {
  BillCursor,
  BillMeasurementRow,
  BillTotals,
  StoredBill,
  StoredBillDeduction,
  StoredBillLine,
  UnbilledDay,
} from "./contractor-bill-ports";
import type { ContractsDirectory, ContractsTx, PartyInvoicing } from "./ports";

/**
 * What Client Bills keep (CM-1107), and the store that keeps them (Prisma
 * in `infrastructure/prisma-client-bill-store.ts`). A Client Bill is the
 * same `bills` row as a Contractor Bill on the client side: it names the
 * Project's Client instead of a Work Order, its lines name BOQ items, and
 * it stores the tax invoice's GSTINs and place of supply. Every command
 * runs in one transaction that first takes the Project's BOQ lock, as
 * Contractor Bills do.
 */

export const CLIENT_BILL_MENU = "contracts.client_bills";

/** The approval document type messaging links to Client Bills (`APPROVAL_DOCUMENTS`). */
export const CLIENT_BILL_DOCUMENT_TYPE = "client_bill";

export type StoredClientBill = Omit<StoredBill, "workOrderId"> & {
  /** The Project's Client when the bill was drafted. */
  clientId: string;
  /** The Client's GSTIN, copied when drafted or refreshed. */
  recipientGstin: string | null;
};

export type StoredClientBillLine = Omit<StoredBillLine, "workOrderLineId"> & {
  boqItemId: string;
};

export type ClientBillMeasurementRow = Omit<
  BillMeasurementRow,
  "workOrderLineId"
> & { boqItemId: string };

export type ClientBillFilter = {
  workspaceId: string;
  projectId: string;
  status?: BillStatus;
  /** Bill date on or after. */
  from?: CalendarDate;
  /** Bill date on or before. */
  to?: CalendarDate;
};

/** The client contract's terms as stored, with its optimistic stamp. */
export type StoredClientContract = {
  id: string;
  projectId: string;
  terms: ClientContractTerms;
  updatedAt: Date;
  updatedBy: string;
};

export type ClientBillStore = {
  list(
    db: ContractsTx,
    params: ClientBillFilter & {
      limit: number;
      after?: BillCursor;
      before?: BillCursor;
    },
  ): Promise<{ items: StoredClientBill[]; total: number; hasMore: boolean }>;
  totals(db: ContractsTx, filter: ClientBillFilter): Promise<BillTotals>;
  find(
    db: ContractsTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredClientBill | null>;
  lines(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ): Promise<StoredClientBillLine[]>;
  deductions(
    db: ContractsTx,
    workspaceId: string,
    billIds: readonly string[],
  ): Promise<StoredBillDeduction[]>;
  /**
   * Inserts the bill; 409 `BILL_OPEN_EXISTS` (one draft or pending running
   * client bill per Project) or `BILL_NUMBER_TAKEN` from the partial
   * unique indexes.
   */
  insert(tx: ContractsTx, bill: StoredClientBill): Promise<void>;
  /** Writes every field; false when `updatedAt` is not `expectedUpdatedAt`. */
  update(
    tx: ContractsTx,
    after: StoredClientBill,
    expectedUpdatedAt: Date,
  ): Promise<boolean>;
  replaceLines(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    lines: readonly StoredClientBillLine[],
  ): Promise<void>;
  replaceDeductions(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    deductions: readonly StoredBillDeduction[],
  ): Promise<void>;
  delete(
    tx: ContractsTx,
    input: {
      bill: StoredClientBill;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
  /**
   * Rows a client bill may take: on the Project's live, checked
   * client-side sheets measured on or before `measuredUpTo`, naming a BOQ
   * item, and not taken by any bill.
   */
  billableRows(
    db: ContractsTx,
    input: {
      workspaceId: string;
      projectId: string;
      measuredUpTo: CalendarDate;
    },
  ): Promise<ClientBillMeasurementRow[]>;
  /** The Project's unbilled checked client-side rows, per date measured. */
  unbilledDays(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<UnbilledDay[]>;
  rowsOfBill(
    db: ContractsTx,
    workspaceId: string,
    billId: string,
  ): Promise<ClientBillMeasurementRow[]>;
  takeRows(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
    rowIds: readonly string[],
  ): Promise<void>;
  freeRows(
    tx: ContractsTx,
    workspaceId: string,
    billId: string,
  ): Promise<number>;
  /** Ten-thousandths billed per BOQ item on the Project's approved client bills. */
  billedByItem(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<Map<string, bigint>>;
  /** Paise of retention on the Project's approved client bills, leaving out `exceptBillId`. */
  retentionHeld(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    exceptBillId: string | null,
  ): Promise<bigint>;
  /** The highest ordinal among the Project's live client bills that count. */
  maxOrdinal(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<number>;
  /**
   * Live client bills on the Project, other than `bill`, that are open
   * (draft or pending) or approved with a higher ordinal.
   */
  laterBills(
    db: ContractsTx,
    workspaceId: string,
    bill: Pick<StoredClientBill, "id" | "projectId" | "ordinal">,
  ): Promise<number>;
  /** The Project's draft or pending running client bill, if any. */
  openBillId(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<string | null>;
  /** The client contract's terms (one row per Project), or null before any are saved. */
  contract(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<StoredClientContract | null>;
  /**
   * Saves the terms: inserts the Project's row, or updates it when
   * `expectedUpdatedAt` matches (false otherwise).
   */
  saveContract(
    tx: ContractsTx,
    input: {
      workspaceId: string;
      projectId: string;
      id: string;
      terms: ClientContractTerms;
      expectedUpdatedAt: Date | null;
      by: string;
      at: Date;
    },
  ): Promise<boolean>;
  names(
    db: ContractsTx,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

/** Checks one date against the Back-dated Entry policy (`loadBackdatedCheck`). */
export type ClientBillBackdatedCheck = (
  module: "client_bill",
  action: "create" | "edit",
  date: CalendarDate,
) => void;

export type ClientBillDeps = {
  db: BoqDb;
  store: ClientBillStore;
  /** The Project's BOQ lock, its items and sections. */
  boq: BoqStore;
  directory: ContractsDirectory;
  /** The receivable invoice in finance (ADR CM-0023 §7). */
  invoicing: PartyInvoicing;
  /** The client contract's advances and retention releases (CM-1108). */
  advances: AdvanceStore;
  /** One-line labels for the rows' locations ("Wing A · Floor 1"). */
  locationLabels: (
    workspaceId: string,
    projectId: string,
  ) => Promise<(location: LocationRef | null) => string | null>;
  backdated: (access: {
    workspaceId: string;
    userId: string;
    role: "owner" | "member";
  }) => Promise<ClientBillBackdatedCheck>;
  /** The Company's today: no bill dated after it. */
  today: (workspaceId: string) => Promise<CalendarDate>;
  /** `document.submitted|approved|rejected` (type `client_bill`), after commit. */
  events: EventDispatcher;
  clock?: () => Date;
};
