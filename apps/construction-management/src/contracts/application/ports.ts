import type { Prisma } from "@repo/construction-db";

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
// PartyInvoicing (CM-1101; used from CM-1106 and CM-1107): an approved RA
// bill becomes a finance invoice, and reversing the bill reverses it (ADR
// CM-0023 §7). Implemented in `src/composition/contracts-party-invoicing.ts`.
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
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  /**
   * Paise held back as retention: posted to the party ledger as retention
   * held (payable) or retention receivable, not as owed now.
   */
  retentionHeld: bigint;
  /** Paise: gross + GST − retention − recoveries; what is owed now. */
  net: bigint;
  /** The bill's id: the invoice's origin is `ra_bill` with this source. */
  sourceId: string;
};

export type PartyInvoicing = {
  /** Creates the invoice and its ledger entries; returns the invoice id. */
  create(tx: ContractsTx, draft: PartyInvoiceDraft): Promise<string>;
  /**
   * Reverses the invoice the bill created (refused by finance once anything
   * was paid or received against it: 409 `BILL_SETTLED`).
   */
  reverse(
    tx: ContractsTx,
    input: { workspaceId: string; by: string; sourceId: string },
  ): Promise<void>;
};
