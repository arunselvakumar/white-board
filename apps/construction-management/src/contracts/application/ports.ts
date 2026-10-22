import type { Prisma } from "@repo/construction-db";

import type { MemberAccess } from "@/src/shared-kernel/access";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

/** A transaction or the client: contracts reads and writes inside its commands' transactions. */
export type ContractsTx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// ContractsDirectory (CM-1101): what contracts reads from projects, masters
// and site-work (ADR CM-0023 §1). Implemented in
// `src/composition/contracts-directory.ts`; contracts never imports those
// contexts. Every lookup is scoped to the Company.
// ---------------------------------------------------------------------------

/** Contract work (built for a Client, who is billed) or Own development (CM-0023 §2). */
export type ContractsProjectRole = "contract" | "own";

export type ContractsProjectFacts = {
  id: string;
  name: string;
  role: ContractsProjectRole;
  /** GST state code of the site: the place of supply (CM-0023 §11). */
  stateCode: string | null;
  /** The Client master record, when the Project links one. */
  clientId: string | null;
  /** The Client's name as the Project shows it (typed or filled from the Client). */
  clientName: string | null;
  /** The Client Order's value excluding GST, paise (Financial). */
  orderValue: bigint | null;
  /** Wings (a building) or Locations (ADR CM-0013 §1). */
  structure: "wings" | "locations";
};

export type ContractsDepartmentFacts = {
  id: string;
  name: string;
  /** Live and not disabled: offered in pickers. */
  active: boolean;
};

export type ContractsContractorFacts = {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  stateCode: string | null;
  /** TDS is deducted from payments to this Contractor (CM-0017 §8). */
  tdsApplicable: boolean;
  /** Live and active: offered in pickers. */
  active: boolean;
  /** The Contractor's Departments (trades), live or not, by name. */
  departments: ContractsDepartmentFacts[];
  /** Assigned to the Project asked about (Resources). */
  onProject: boolean;
};

export type ContractsClientFacts = {
  id: string;
  name: string;
  gstin: string | null;
  pan: string | null;
  tan: string | null;
  stateCode: string | null;
  address: string | null;
  pinCode: string | null;
  email: string | null;
  mobile: string | null;
  /** Live and active: offered in pickers. */
  active: boolean;
};

/** A Company billing address with its GSTIN (CM-1107): the supplier on a Client Bill. */
export type ContractsBillingAddressFacts = {
  id: string;
  name: string;
  address: string;
  stateCode: string;
  gstin: string | null;
  isDefault: boolean;
};

export type ContractsUomFacts = {
  id: string;
  name: string;
  active: boolean;
};

export type ContractsMaterialFacts = {
  id: string;
  name: string;
  specification: string | null;
  uomId: string;
  uomName: string;
  hsnCode: string | null;
  /** GST %, as stored (`"18.00"`). */
  gstRate: string | null;
  /** Paise per unit (Financial): the default rate for material issued at cost. */
  unitRate: bigint | null;
  active: boolean;
};

export type ContractsLabourCategoryFacts = {
  id: string;
  name: string;
  skill: "skilled" | "unskilled";
  active: boolean;
};

export type ContractsEquipmentFacts = {
  id: string;
  name: string;
  equipmentNumber: string;
  active: boolean;
};

export type ContractsWingFacts = {
  id: string;
  name: string;
  phaseName: string;
  /** Live, and its Phase is live. */
  active: boolean;
};

export type ContractsLocationFacts = {
  id: string;
  name: string;
  active: boolean;
};

/** Lists for pickers: live, enabled rows only, by name unless noted. */
export type ContractsDirectory = {
  /** A live Project of the Company, or null (404 `PROJECT_NOT_FOUND`). */
  project(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<ContractsProjectFacts | null>;

  /** Active Contractors assigned to the Project, with their live Departments. */
  contractorsOnProject(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<ContractsContractorFacts[]>;
  /** Contractors by id with `onProject` answered for `projectId`; removed ones included. */
  contractors(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    contractorIds: readonly string[],
  ): Promise<ReadonlyMap<string, ContractsContractorFacts>>;
  /** Departments by id; removed and disabled ones included (for names). */
  departments(
    db: ContractsTx,
    workspaceId: string,
    departmentIds: readonly string[],
  ): Promise<ReadonlyMap<string, ContractsDepartmentFacts>>;

  /** Active Clients. */
  clientOptions(
    db: ContractsTx,
    workspaceId: string,
  ): Promise<ContractsClientFacts[]>;
  /** Clients by id; removed ones included. */
  clients(
    db: ContractsTx,
    workspaceId: string,
    clientIds: readonly string[],
  ): Promise<ReadonlyMap<string, ContractsClientFacts>>;

  /** The Company's live billing addresses, default first (CM-1107). */
  billingAddresses(
    db: ContractsTx,
    workspaceId: string,
  ): Promise<ContractsBillingAddressFacts[]>;

  /** Enabled Materials, optionally matching `search` in the name, at most `limit`. */
  materialOptions(
    db: ContractsTx,
    workspaceId: string,
    query: { search?: string; limit: number },
  ): Promise<ContractsMaterialFacts[]>;
  /** Materials by id; removed and disabled ones included. */
  materials(
    db: ContractsTx,
    workspaceId: string,
    materialIds: readonly string[],
  ): Promise<ReadonlyMap<string, ContractsMaterialFacts>>;

  /** Enabled Labour Categories. */
  labourCategoryOptions(
    db: ContractsTx,
    workspaceId: string,
  ): Promise<ContractsLabourCategoryFacts[]>;
  labourCategories(
    db: ContractsTx,
    workspaceId: string,
    labourCategoryIds: readonly string[],
  ): Promise<ReadonlyMap<string, ContractsLabourCategoryFacts>>;

  /** Live Equipment. */
  equipmentOptions(
    db: ContractsTx,
    workspaceId: string,
  ): Promise<ContractsEquipmentFacts[]>;
  equipment(
    db: ContractsTx,
    workspaceId: string,
    equipmentIds: readonly string[],
  ): Promise<ReadonlyMap<string, ContractsEquipmentFacts>>;

  /** Enabled units of measure (UoMs). */
  uomOptions(
    db: ContractsTx,
    workspaceId: string,
  ): Promise<ContractsUomFacts[]>;
  uoms(
    db: ContractsTx,
    workspaceId: string,
    uomIds: readonly string[],
  ): Promise<ReadonlyMap<string, ContractsUomFacts>>;

  /** The Project's live Wings in phase and wing order. */
  wings(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<ContractsWingFacts[]>;
  /** Wings by id on the Project; removed ones included. */
  wingsById(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    wingIds: readonly string[],
  ): Promise<ReadonlyMap<string, ContractsWingFacts>>;
  /** The Project's live Locations in their order. */
  locations(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
  ): Promise<ContractsLocationFacts[]>;
  /** Locations by id on the Project; removed ones included. */
  locationsById(
    db: ContractsTx,
    workspaceId: string,
    projectId: string,
    locationIds: readonly string[],
  ): Promise<ReadonlyMap<string, ContractsLocationFacts>>;
};

// ---------------------------------------------------------------------------
// PartyInvoicing (CM-1101; implemented for Contractor Bills in CM-1106 and
// Client Bills in CM-1107): an approved RA bill becomes a finance invoice,
// and reversing the bill reverses it (ADR CM-0023 §7).
// Implemented in `src/composition/contracts-party-invoicing.ts` over
// finance's own handlers; contracts never writes finance tables.
// ---------------------------------------------------------------------------

/** Who the invoice is with: a Contractor (payable) or the Project's Client (receivable). */
export type InvoicePartyType = "contractor" | "client";

export type PartyInvoiceDraft = {
  workspaceId: string;
  /** User id, written as `created_by`. */
  by: string;
  partyType: InvoicePartyType;
  partyId: string;
  projectId: string;
  /** A Contractor's Department the Work Order names, if any. */
  departmentId: string | null;
  /** Contractor bills are payable; Client bills are receivable. */
  direction: "payable" | "receivable";
  /** The bill's number, printed as the invoice number. */
  number: string;
  date: CalendarDate;
  /** Paise: the bill's gross for the period, before GST. */
  taxable: bigint;
  /**
   * Paise of GST in `amount`: CGST + SGST + IGST, or 0 under reverse
   * charge (the Company pays that GST, so it is not owed to the party).
   * Finance keeps one total until CM-1113 splits invoices' GST.
   */
  gst: bigint;
  /**
   * Paise: the bill's net (gross + GST payable − retention − recoveries)
   * **plus the advances it recovers** (CM-1108). A recovery is the advance
   * being applied to the bill, not money withheld, so approval then
   * allocates it from the advance's payment (`applyRecoveries`) and the
   * invoice's balance is the net. Retention held (Contractor Bills) or
   * receivable (Client Bills) stays in contracts until it is released.
   */
  amount: bigint;
  /** The bill's id: the invoice's origin is `ra_bill` with this source. */
  sourceId: string;
};

export type PartyInvoicing = {
  /**
   * Creates the invoice and its party-ledger entry; returns the invoice
   * id. 409 `BILL_INVOICE_NUMBER_TAKEN` when the party already has a live
   * invoice of that direction with that number.
   */
  create(tx: ContractsTx, draft: PartyInvoiceDraft): Promise<string>;
  /**
   * Anything paid, written off or pending write-off against the invoice.
   * Allocations from `ownRecoveries` (the bill's own advance recoveries,
   * CM-1108) do not count, up to their amounts.
   */
  isSettled(
    tx: ContractsTx,
    input: {
      workspaceId: string;
      invoiceId: string;
      ownRecoveries?: readonly RecoveryAllocation[];
    },
  ): Promise<boolean>;
  /**
   * Allocates each recovered advance's on-account payment to the bill's
   * invoice (CM-1108), without moving money. 409 `ADVANCE_ON_ACCOUNT_SHORT`
   * when a payment was applied elsewhere in finance meanwhile.
   */
  applyRecoveries(
    tx: ContractsTx,
    input: {
      workspaceId: string;
      by: string;
      invoiceId: string;
      recoveries: readonly RecoveryAllocation[];
    },
  ): Promise<void>;
  /** Takes back `applyRecoveries` (a reversed bill). */
  undoRecoveries(
    tx: ContractsTx,
    input: {
      workspaceId: string;
      by: string;
      invoiceId: string;
      paymentIds: readonly string[];
    },
  ): Promise<void>;
  /**
   * The invoice for released retention (CM-1108): origin
   * `retention_release`, payable to the Contractor or receivable from the
   * Client, no taxable value or GST. A taken number gets "-2", "-3", ….
   */
  createRelease(
    tx: ContractsTx,
    draft: RetentionReleaseInvoiceDraft,
  ): Promise<{ id: string; number: string }>;
  /** Number and state of invoices, for the screens (read-only, no locks). */
  invoiceStates(
    db: ContractsTx,
    workspaceId: string,
    invoiceIds: readonly string[],
  ): Promise<Map<string, InvoiceState>>;
  /**
   * Reverses the invoice's party-ledger entry and removes the invoice.
   * Callers ask `isSettled` first (409 `BILL_SETTLED`).
   */
  reverse(
    tx: ContractsTx,
    input: {
      workspaceId: string;
      by: string;
      invoiceId: string;
      reason: string;
    },
  ): Promise<void>;
};

/** One advance's recovery on a bill, as finance allocates it. */
export type RecoveryAllocation = { paymentId: string; amount: bigint };

export type RetentionReleaseInvoiceDraft = {
  workspaceId: string;
  by: string;
  partyType: InvoicePartyType;
  partyId: string;
  projectId: string;
  departmentId: string | null;
  number: string;
  date: CalendarDate;
  amount: bigint;
  /** The release's id: the invoice's `source_id`. */
  sourceId: string;
  /** "Retention released on WO/… (on completion)". */
  remarks: string;
};

export type InvoiceState = {
  number: string;
  amount: bigint;
  /** Paid or received, TDS included. */
  allocated: bigint;
  balance: bigint;
  /** Anything paid, written off or pending write-off. */
  settled: boolean;
};

// ---------------------------------------------------------------------------
// AdvancePayments (CM-1108): an advance given to a Contractor is an
// on-account Payment Out, one received from the Client an on-account
// Payment In, recorded through finance's own payment command inside the
// advance's transaction. Implemented in
// `src/composition/contracts-party-invoicing.ts`.
// ---------------------------------------------------------------------------

export type AdvancePaymentDraft = {
  partyType: InvoicePartyType;
  partyId: string;
  projectId: string;
  /** `out` to a Contractor, `in` from a Client. */
  direction: "out" | "in";
  paymentDate: CalendarDate;
  accountId: string;
  mode: "cash" | "cheque" | "online" | "upi";
  chequeNumber: string | null;
  reference: string | null;
  modeDate: string | null;
  amount: bigint;
  /** The payment's remarks: "Mobilisation advance on WO/…". */
  remarks: string;
  confirmDuplicateReference: boolean;
};

export type AdvancePayments = {
  /**
   * Records the payment with finance's own checks (Parties Create on the
   * Project, the account and mode, Back-dated Entry, duplicate reference);
   * returns its id and number.
   */
  record(
    tx: ContractsTx,
    access: MemberAccess,
    draft: AdvancePaymentDraft,
  ): Promise<{ paymentId: string; number: string }>;
  /** Cancels it (Parties Delete on the Project, Back-dated Entry). */
  cancel(
    tx: ContractsTx,
    access: MemberAccess,
    paymentId: string,
  ): Promise<void>;
  /** Payment numbers by id, for the screens. */
  numbers(
    db: ContractsTx,
    workspaceId: string,
    paymentIds: readonly string[],
  ): Promise<Map<string, string>>;
};
