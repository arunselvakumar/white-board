import type { Prisma } from "@repo/construction-db";

import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { DomainEvent } from "@/src/shared-kernel/events";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

/** A transaction on the Construction client; ports run inside the caller's. */
export type SiteWorkTx = Prisma.TransactionClient;

/** The sheet a material line belongs to, as the stock ledger names it. */
export type SiteStockSource = {
  type: "daily_worksheet" | "equipment_usage";
  id: string;
};

/** One material line to post as Consumed at the Project (CM-0016 §5). */
export type SiteStockLine = {
  lineId: string;
  materialId: string;
  materialName: string;
  /** Decimal string > 0, in the material's unit. */
  quantity: string;
};

export type SiteStockPosting = {
  workspaceId: string;
  by: string;
  projectId: string;
  date: CalendarDate;
  siteLocation: LocationRef | null;
  /** "Consumed by WS/26-27/00001" in Current Inventory's history. */
  label: string;
  lines: readonly SiteStockLine[];
};

/**
 * Posts and reverses a sheet's material lines on the stock ledger without
 * importing procurement (ADR CM-0001). `src/composition/site-work-stock.ts`
 * implements it. Each call runs in the caller's transaction, takes the
 * ledger's locks, and throws 409 `STOCK_INSUFFICIENT` when stock would go
 * below zero on that date or later (CM-0015 §3). The returned events
 * (`StockBelowMinimum`) are dispatched after commit with `dispatch`.
 */
export type SiteStock = {
  /** Replaces whatever the source posted before (none on create). */
  replace(
    tx: SiteWorkTx,
    source: SiteStockSource,
    posting: SiteStockPosting,
  ): Promise<{ events: DomainEvent[] }>;
  /** Reverses everything the source posted (delete). */
  reverse(
    tx: SiteWorkTx,
    source: SiteStockSource,
    ctx: { workspaceId: string; by: string },
  ): Promise<{ events: DomainEvent[] }>;
  dispatch(events: readonly DomainEvent[]): Promise<void>;
  /**
   * Stock per material at the Project on a date (inclusive; now when `on`
   * is omitted), as decimal strings; materials with no entries are absent.
   * The forms show it next to Used Qty.
   */
  available(
    workspaceId: string,
    projectId: string,
    materialIds: readonly string[],
    on?: CalendarDate,
  ): Promise<Map<string, string>>;
};

// ---------------------------------------------------------------------------
// Site Diary and Hindrance register (CM-607)
// ---------------------------------------------------------------------------

/** A Contractor assigned to a Project (Resources), live. */
export type SiteRecordContractor = {
  id: string;
  name: string;
  isActive: boolean;
};

/**
 * A Team Member who may sign off a hindrance for the Company: an active
 * member assigned to the Project, or the Owner (on every Project).
 */
export type SiteRecordTeamMember = {
  userId: string;
  name: string;
  isOwner: boolean;
};

/**
 * What the Site Diary and the Hindrance register read from projects,
 * masters and organization. `src/composition/site-record-directory.ts`
 * implements it.
 */
export type SiteRecordDirectory = {
  /** A live Project of the Company. */
  projectExists(workspaceId: string, projectId: string): Promise<boolean>;
  /** Live Contractors assigned to the Project, by name. */
  projectContractors(
    workspaceId: string,
    projectId: string,
  ): Promise<SiteRecordContractor[]>;
  /** Contractor names by id (deleted ones too, for old records). */
  contractorNames(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
  /** Who may sign off on the Project, by name. */
  projectTeamMembers(
    workspaceId: string,
    projectId: string,
  ): Promise<SiteRecordTeamMember[]>;
  /** Team Member names by User id. */
  userNames(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

// ---------------------------------------------------------------------------
// Daily Worksheets (CM-602): what the worksheet reads from masters, projects,
// labour and organization. `src/composition/worksheet-directory.ts`
// implements both ports by table, without importing those contexts.
// ---------------------------------------------------------------------------

/** A Contractor with its Projects and Departments (masters, CM-406). */
export type WorksheetContractorFacts = {
  id: string;
  name: string;
  isActive: boolean;
  projectIds: readonly string[];
  departmentIds: readonly string[];
};

export type WorksheetNamedFacts = {
  id: string;
  name: string;
  disabled: boolean;
};

/** A Work Type (masters, CM-601) with the Materials assigned to it. */
export type WorksheetWorkTypeFacts = WorksheetNamedFacts & {
  departmentId: string;
  materialIds: readonly string[];
};

/** A Material as a worksheet line copies it. */
export type WorksheetMaterialFact = WorksheetNamedFacts & { unitName: string };

/**
 * The masters, projects and organization facts a worksheet reads. Every
 * method reads live rows of the Company only; `byIds` methods return what
 * they find (disabled included) keyed by id.
 */
export type WorksheetDirectory = {
  projectName(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
  ): Promise<string | null>;
  /** Contractors assigned to the Project (Resources), with their Departments. */
  contractorsOnProject(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
  ): Promise<WorksheetContractorFacts[]>;
  contractors(
    db: SiteWorkTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, WorksheetContractorFacts>>;
  departments(
    db: SiteWorkTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, WorksheetNamedFacts>>;
  /** Work Types by id, or every Work Type of these Departments. */
  workTypes(
    db: SiteWorkTx,
    workspaceId: string,
    filter: { ids: readonly string[] } | { departmentIds: readonly string[] },
  ): Promise<WorksheetWorkTypeFacts[]>;
  materials(
    db: SiteWorkTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, WorksheetMaterialFact>>;
  /** Measurement Units by id, or every live one when `ids` is null. */
  units(
    db: SiteWorkTx,
    workspaceId: string,
    ids: readonly string[] | null,
  ): Promise<WorksheetNamedFacts[]>;
  /** Team Member names by User id (Filled By). */
  memberNames(
    db: SiteWorkTx,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};

/**
 * The Project's attendance on a date, as heads by Labour Category skill
 * (CM-0016 §6): labour attendance present or half day counts one head per
 * live row; vendor attendance lines count full-day plus half-day heads.
 * `skill` is null for a labourer with no category.
 */
export type AttendanceHeadcounts = {
  onDate(
    db: SiteWorkTx,
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<{ skill: "skilled" | "unskilled" | null; heads: number }[]>;
};

// ---------------------------------------------------------------------------
// Equipment register (CM-603): what it reads from projects and masters.
// ---------------------------------------------------------------------------

/** A live Project of the Company, by name. */
export type EquipmentProjectFacts = { id: string; name: string };

/** A live Contractor of the Company: a hire party (CM-0016 §10). */
export type EquipmentHirePartyFacts = {
  id: string;
  name: string;
  /** Disabled Contractors stay readable but cannot be chosen anew. */
  isActive: boolean;
};

/**
 * Projects, Contractors and Team Member names for the Equipment register,
 * without importing projects, masters or organization (ADR CM-0001).
 * `src/composition/equipment-directory.ts` implements it.
 */
export type EquipmentDirectory = {
  /** Live Projects among `ids`. */
  projects(
    db: SiteWorkTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, EquipmentProjectFacts>>;
  /** Every live Project, by name (the transfer dialog). */
  projectOptions(
    db: SiteWorkTx,
    workspaceId: string,
  ): Promise<EquipmentProjectFacts[]>;
  /** Live Contractors among `ids`. */
  hireParties(
    db: SiteWorkTx,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, EquipmentHirePartyFacts>>;
  /** Live, enabled Contractors, by name (the hire party picker). */
  hirePartyOptions(
    db: SiteWorkTx,
    workspaceId: string,
  ): Promise<EquipmentHirePartyFacts[]>;
  /** Team Member names by User id. */
  memberNames(
    db: SiteWorkTx,
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};
