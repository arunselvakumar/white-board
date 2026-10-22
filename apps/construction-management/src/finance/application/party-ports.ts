import type { Prisma } from "@repo/construction-db";

import type { MemberAccess } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import type { AccountFacts } from "../domain/accounts";
import type {
  InvoiceDirection,
  InvoiceOrigin,
  InvoiceStatus,
} from "../domain/invoice";
import type {
  AccountEntrySource,
  NewAccountEntry,
  NewPartyEntry,
  PartyEntryKind,
  PartyEntrySource,
  PartyType,
  PaymentMode,
} from "../domain/ledger";
import type { PartyPlace } from "../domain/party";
import type { PaymentDirection } from "../domain/party-payment";
import type { TdsRate } from "../domain/tds";
import type { FinanceDirectory } from "./ports";

/**
 * Ports of the party money engine (CM-705, CM-706, CM-708): invoices,
 * party payments with allocation and TDS, openings, settlements and the
 * statements built on the party ledger. Prisma implements the store in
 * `infrastructure/prisma-party-store.ts`; the ledgers are the foundation's
 * writers.
 */

export type FinanceTx = Prisma.TransactionClient;

export type FinanceDb = FinanceTx & {
  $transaction<T>(fn: (tx: FinanceTx) => Promise<T>): Promise<T>;
};

export type PartyLedgers = {
  party: {
    post(
      tx: FinanceTx,
      workspaceId: string,
      by: string,
      entries: readonly NewPartyEntry[],
    ): Promise<void>;
    reverseSource(
      tx: FinanceTx,
      workspaceId: string,
      by: string,
      sourceType: PartyEntrySource,
      sourceId: string,
    ): Promise<number>;
  };
  account: {
    post(
      tx: FinanceTx,
      workspaceId: string,
      by: string,
      entries: readonly NewAccountEntry[],
    ): Promise<void>;
    reverseSource(
      tx: FinanceTx,
      workspaceId: string,
      by: string,
      sourceType: AccountEntrySource,
      sourceId: string,
    ): Promise<number>;
  };
};

/** The Back-dated Entry policy for one actor, loaded once per command. */
export type PartyBackdated = {
  check(
    module: "party_invoice" | "party_payment",
    action: "create" | "edit",
    date: CalendarDate,
  ): void;
  /** The Financial Closing Date alone (openings, settlements, cancel). */
  closing(date: CalendarDate): void;
};

export type PartyFinanceDeps = {
  db: FinanceDb;
  directory: FinanceDirectory;
  store: PartyStore;
  ledgers: PartyLedgers;
  backdated: (access: {
    workspaceId: string;
    userId: string;
    role: "owner" | "member";
  }) => Promise<PartyBackdated>;
  today: (workspaceId: string) => Promise<CalendarDate>;
  accountFacts: (
    tx: FinanceTx,
    workspaceId: string,
    accountId: string,
  ) => Promise<AccountFacts | null>;
  tdsRates: (db: FinanceTx) => Promise<TdsRate[]>;
  /**
   * Retention the Client holds back on approved Client Bills, less what it
   * released, per Client (CM-1107, ADR CM-0023 §7). Derived in contracts
   * and read through this port, never a party-ledger entry: on one Project,
   * or every Project when `projectIds` is null.
   */
  retentionReceivable: ClientRetentionReceivable;
  clock?: () => Date;
};

export type ClientRetentionReceivable = (
  db: FinanceTx,
  input: {
    workspaceId: string;
    clientIds: readonly string[];
    projectIds: readonly string[] | null;
  },
) => Promise<Map<string, bigint>>;

export type PartyActor = MemberAccess;

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type StoredInvoice = {
  id: string;
  workspaceId: string;
  partyType: PartyType;
  partyId: string;
  place: PartyPlace;
  direction: InvoiceDirection;
  origin: InvoiceOrigin;
  /**
   * `ra_bill`: the Contractor or Client Bill it came from;
   * `retention_release`: the retention release (construction_contracts).
   */
  sourceId: string | null;
  invoiceNumber: string;
  invoiceDate: CalendarDate;
  dueDate: CalendarDate | null;
  departmentId: string | null;
  taxableAmount: bigint | null;
  gstAmount: bigint | null;
  amount: bigint;
  remarks: string | null;
  settledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type InvoiceFiguresRow = {
  allocated: bigint;
  writtenOff: bigint;
};

export type InvoiceGoodsReceiptLink = {
  id: string;
  invoiceId: string;
  goodsReceiptId: string;
  grnValue: bigint;
};

export type StoredSettlement = {
  id: string;
  workspaceId: string;
  invoiceId: string;
  amount: bigint;
  reason: string;
  approvalStatus: "pending" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: Date | null;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};

export type StoredPartyPayment = {
  id: string;
  workspaceId: string;
  number: string;
  partyType: PartyType;
  partyId: string;
  place: PartyPlace;
  direction: PaymentDirection;
  paymentDate: CalendarDate;
  accountId: string;
  mode: PaymentMode;
  chequeNumber: string | null;
  reference: string | null;
  modeDate: CalendarDate | null;
  amount: bigint;
  tdsSection: string | null;
  tdsBase: bigint | null;
  tdsRate: string | null;
  tdsAmount: bigint;
  tdsSuggested: bigint | null;
  tdsOverrideReason: string | null;
  /** Client receipts (CM-1107): income-tax TDS the Client deducted. */
  clientTdsAmount: bigint;
  /** Client receipts: GST-TDS (s.51) the Client deducted. */
  gstTdsAmount: bigint;
  paymentCategoryId: string | null;
  paidByMemberId: string | null;
  remarks: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type StoredAllocation = {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: bigint;
  createdAt: Date;
};

export type StoredOpening = {
  id: string;
  workspaceId: string;
  partyType: PartyType;
  partyId: string;
  place: PartyPlace;
  asOfDate: CalendarDate;
  amount: bigint;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredPartyEntry = {
  id: string;
  partyType: PartyType;
  partyId: string;
  entryDate: CalendarDate;
  kind: PartyEntryKind;
  amount: bigint;
  invoiceId: string | null;
  sourceType: PartyEntrySource;
  sourceId: string;
  createdAt: Date;
};

/** Σ live party entries by kind for one party on a place. */
export type PartyKindTotals = {
  partyId: string;
  byKind: Partial<Record<PartyEntryKind, bigint>>;
  total: bigint;
};

export type OtherPartyFacts = {
  id: string;
  name: string;
  pan: string | null;
  projectIds: string[];
};

export type InvoiceListFilter = {
  workspaceId: string;
  place: PartyPlace;
  partyType?: PartyType;
  partyId?: string;
  direction?: InvoiceDirection;
  status?: InvoiceStatus;
  /** Open or partly paid (a balance remains, not settled). */
  outstanding?: boolean;
  /** Outstanding with the due date before `today`. */
  overdue?: boolean;
  today: CalendarDate;
  /** Part of the invoice number. */
  search?: string;
};

export type PageParams = {
  limit: number;
  after?: ListCursor;
  before?: ListCursor;
};

export type PaymentListFilter = {
  workspaceId: string;
  place: PartyPlace;
  partyType?: PartyType;
  partyId?: string;
  direction?: PaymentDirection;
  from?: CalendarDate;
  to?: CalendarDate;
  search?: string;
};

export type SettlementListFilter = {
  workspaceId: string;
  status?: "pending" | "approved" | "rejected";
  /** Null: every Project (and Store) of the Company. */
  projectIds: readonly string[] | null;
  includeStores: boolean;
  /** One party type's invoices only. */
  partyType?: PartyType;
};

export type TdsLedgerRow = {
  paymentId: string;
  number: string;
  paymentDate: CalendarDate;
  projectId: string | null;
  storeId: string | null;
  amount: bigint;
  tdsSection: string | null;
  tdsBase: bigint | null;
  tdsRate: string | null;
  tdsAmount: bigint;
  tdsSuggested: bigint | null;
  tdsOverrideReason: string | null;
};

export type Page<T> = { items: T[]; hasMore: boolean; total: number };

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

export type PartyStore = {
  otherParties(
    db: FinanceTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, OtherPartyFacts>>;
  /** Other Parties on a Project (or every one when null), by name. */
  otherPartiesOn(
    db: FinanceTx,
    workspaceId: string,
    projectId: string | null,
  ): Promise<OtherPartyFacts[]>;
  paymentCategoryLive(
    db: FinanceTx,
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string } | null>;
  paymentCategoryNames(
    db: FinanceTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
  accountNames(
    db: FinanceTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { name: string; kind: string }>>;
  companyName(db: FinanceTx, workspaceId: string): Promise<string>;

  // Invoices
  findInvoice(
    db: FinanceTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredInvoice | null>;
  findInvoices(
    db: FinanceTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredInvoice[]>;
  /** Live invoices locked `FOR UPDATE`, in id order. */
  lockInvoices(
    tx: FinanceTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredInvoice[]>;
  invoiceFigures(
    db: FinanceTx,
    ids: readonly string[],
  ): Promise<Map<string, InvoiceFiguresRow>>;
  /** A live invoice of the party in `direction` with this number (ignoring case). */
  numberTaken(
    db: FinanceTx,
    workspaceId: string,
    party: { type: PartyType; id: string },
    direction: InvoiceDirection,
    invoiceNumber: string,
    exceptId: string | null,
  ): Promise<boolean>;
  /** A live bill from the party with this number (ignoring case). */
  payableNumberTaken(
    db: FinanceTx,
    workspaceId: string,
    party: { type: PartyType; id: string },
    invoiceNumber: string,
    exceptId: string | null,
  ): Promise<boolean>;
  insertInvoice(tx: FinanceTx, row: StoredInvoice): Promise<void>;
  updateInvoice(
    tx: FinanceTx,
    id: string,
    patch: Partial<
      Pick<
        StoredInvoice,
        | "invoiceNumber"
        | "invoiceDate"
        | "dueDate"
        | "departmentId"
        | "taxableAmount"
        | "gstAmount"
        | "amount"
        | "remarks"
        | "settledAt"
      >
    > & { updatedAt: Date; updatedBy: string },
  ): Promise<void>;
  tombstoneInvoice(
    tx: FinanceTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  listInvoiceIds(
    db: FinanceTx,
    filter: InvoiceListFilter,
    page: PageParams,
  ): Promise<Page<{ id: string; createdAt: Date }>>;
  /** Outstanding invoices of a party on a place, oldest due first. */
  outstandingInvoices(
    db: FinanceTx,
    workspaceId: string,
    party: { type: PartyType; id: string },
    place: PartyPlace,
    direction: InvoiceDirection,
  ): Promise<StoredInvoice[]>;

  // GRN links
  linksOfInvoices(
    db: FinanceTx,
    invoiceIds: readonly string[],
  ): Promise<InvoiceGoodsReceiptLink[]>;
  liveLinkOfGoodsReceipt(
    db: FinanceTx,
    goodsReceiptId: string,
  ): Promise<InvoiceGoodsReceiptLink | null>;
  insertLinks(
    tx: FinanceTx,
    workspaceId: string,
    links: readonly Omit<InvoiceGoodsReceiptLink, "id">[],
  ): Promise<void>;
  updateLinkValue(tx: FinanceTx, id: string, grnValue: bigint): Promise<void>;
  tombstoneLinks(
    tx: FinanceTx,
    where: { invoiceId: string } | { id: string },
    at: Date,
  ): Promise<void>;

  // Settlements
  findSettlement(
    db: FinanceTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredSettlement | null>;
  lockSettlements(
    tx: FinanceTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredSettlement[]>;
  settlementsOfInvoices(
    db: FinanceTx,
    invoiceIds: readonly string[],
  ): Promise<StoredSettlement[]>;
  insertSettlement(
    tx: FinanceTx,
    row: StoredSettlement & { updatedBy: string },
  ): Promise<void>;
  decideSettlement(
    tx: FinanceTx,
    id: string,
    decision: {
      approvalStatus: "approved" | "rejected";
      amount?: bigint;
      rejectReason: string | null;
      by: string;
      at: Date;
    },
  ): Promise<void>;
  listSettlements(
    db: FinanceTx,
    filter: SettlementListFilter,
  ): Promise<StoredSettlement[]>;

  // Payments
  findPayment(
    db: FinanceTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredPartyPayment | null>;
  lockPayment(
    tx: FinanceTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredPartyPayment | null>;
  insertPayment(tx: FinanceTx, row: StoredPartyPayment): Promise<void>;
  touchPayment(tx: FinanceTx, id: string, by: string, at: Date): Promise<void>;
  tombstonePayment(
    tx: FinanceTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  listPaymentIds(
    db: FinanceTx,
    filter: PaymentListFilter,
    page: PageParams,
  ): Promise<Page<{ id: string; createdAt: Date }>>;
  findPayments(
    db: FinanceTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<StoredPartyPayment[]>;
  allocationsOfPayments(
    db: FinanceTx,
    paymentIds: readonly string[],
  ): Promise<StoredAllocation[]>;
  allocationsOfInvoices(
    db: FinanceTx,
    invoiceIds: readonly string[],
  ): Promise<StoredAllocation[]>;
  insertAllocations(
    tx: FinanceTx,
    workspaceId: string,
    by: string,
    paymentId: string,
    allocations: readonly { invoiceId: string; amount: bigint }[],
  ): Promise<void>;
  tombstoneAllocations(
    tx: FinanceTx,
    paymentId: string,
    by: string,
    at: Date,
  ): Promise<void>;
  /** Tombstones one payment's live allocations to one invoice (CM-1108). */
  tombstoneAllocationsTo(
    tx: FinanceTx,
    paymentId: string,
    invoiceId: string,
    by: string,
    at: Date,
  ): Promise<void>;
  /**
   * A live (neither reversed nor reversing) account entry of the account
   * with this cheque number or reference, ignoring case: its document
   * number, or null.
   */
  duplicateReference(
    db: FinanceTx,
    workspaceId: string,
    accountId: string,
    reference: string,
  ): Promise<{ documentNumber: string | null } | null>;
  /**
   * A Contractor's live payments in a financial year dated on or before
   * `upTo` (across Projects), `exceptId` left out: Σ settled (amount +
   * TDS) and Σ base of those without TDS.
   */
  contractorYearToDate(
    db: FinanceTx,
    workspaceId: string,
    contractorId: string,
    range: { from: CalendarDate; upTo: CalendarDate },
    exceptId: string | null,
  ): Promise<{ settled: bigint; undeductedBase: bigint }>;
  /** Paid + TDS not yet allocated, per party, on a place. */
  advances(
    db: FinanceTx,
    workspaceId: string,
    partyType: PartyType,
    place: PartyPlace,
  ): Promise<Map<string, bigint>>;
  tdsLedger(
    db: FinanceTx,
    workspaceId: string,
    contractorId: string,
    range: { from: CalendarDate; to: CalendarDate },
  ): Promise<TdsLedgerRow[]>;

  // Openings
  findOpening(
    db: FinanceTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredOpening | null>;
  /** The live opening of a party on a place, locked `FOR UPDATE`. */
  lockOpeningOf(
    tx: FinanceTx,
    workspaceId: string,
    party: { type: PartyType; id: string },
    place: PartyPlace,
  ): Promise<StoredOpening | null>;
  lockOpening(
    tx: FinanceTx,
    workspaceId: string,
    id: string,
  ): Promise<StoredOpening | null>;
  insertOpening(
    tx: FinanceTx,
    row: StoredOpening & { by: string },
  ): Promise<void>;
  updateOpening(
    tx: FinanceTx,
    id: string,
    patch: { asOfDate: CalendarDate; amount: bigint; by: string; at: Date },
  ): Promise<void>;
  tombstoneOpening(
    tx: FinanceTx,
    id: string,
    by: string,
    at: Date,
  ): Promise<void>;
  openingsOn(
    db: FinanceTx,
    workspaceId: string,
    partyType: PartyType,
    place: PartyPlace,
  ): Promise<StoredOpening[]>;

  // Party ledger reads
  /** Σ entries by party and kind (reversals net out) on a place. */
  kindTotals(
    db: FinanceTx,
    workspaceId: string,
    partyType: PartyType,
    place: PartyPlace,
    partyId?: string,
  ): Promise<PartyKindTotals[]>;
  /** Live entries (no reversal pairs) of a party on a place, by date. */
  liveEntries(
    db: FinanceTx,
    workspaceId: string,
    party: { type: PartyType; id: string },
    place: PartyPlace,
    range: { from: CalendarDate | null; to: CalendarDate | null },
  ): Promise<StoredPartyEntry[]>;
  /** Σ entries of a party on a place dated before `date`. */
  balanceBefore(
    db: FinanceTx,
    workspaceId: string,
    party: { type: PartyType; id: string },
    place: PartyPlace,
    date: CalendarDate,
  ): Promise<bigint>;
  /**
   * Σ entries per party and Project, across Projects (null: every
   * Project of the Company); Store balances left out.
   */
  balancesByProject(
    db: FinanceTx,
    workspaceId: string,
    partyType: PartyType,
    projectIds: readonly string[] | null,
  ): Promise<{ partyId: string; projectId: string; amount: bigint }[]>;
  /** Σ balance of outstanding invoices due before `today`, per party. */
  overdueByParty(
    db: FinanceTx,
    workspaceId: string,
    partyType: PartyType,
    place: PartyPlace,
    today: CalendarDate,
  ): Promise<Map<string, bigint>>;
};
