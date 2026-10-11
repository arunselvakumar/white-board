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
