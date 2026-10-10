import type { Prisma } from "@repo/construction-db";

import type { DomainEvent } from "@/src/shared-kernel/events";

import type { StockLocation } from "../domain/stock-location";

/**
 * What procurement reads from other contexts, by id (ADR CM-0001: no
 * context imports another's folder). Implemented in `src/composition`
 * (`procurement-directory.ts`) over the owning contexts' tables. Every
 * method answers only the Company's live rows; a missing id is simply
 * absent from the map, and the caller raises its own 400.
 */

/** A Material as a document line copies it (CM-501, CM-0015 §1). */
export type MaterialFacts = {
  id: string;
  name: string;
  uomId: string;
  uomName: string;
  categoryId: string | null;
  categoryName: string | null;
  /** Paise per unit, or null when the Material has no rate details. */
  unitRate: bigint | null;
  discount:
    | { type: "amount"; paise: bigint }
    | { type: "percent"; percent: string }
    | null;
  /** Percent as a decimal string ("18.00"), or null. */
  gstRate: string | null;
  hsnCode: string | null;
  /** Decimal string, or null. */
  minStockQty: string | null;
  disabled: boolean;
};

export type SupplierFacts = {
  id: string;
  name: string;
  gstin: string | null;
  /** GST state code (from the GSTIN, or picked on the form). */
  stateCode: string | null;
  isActive: boolean;
  /** Projects it is assigned to (Resources). */
  projectIds: readonly string[];
};

export type ContractorFacts = {
  id: string;
  name: string;
  isActive: boolean;
  projectIds: readonly string[];
};

export type BillingAddressFacts = {
  id: string;
  name: string;
  address: string;
  stateCode: string;
  gstin: string | null;
  isDefault: boolean;
};

export type TermsFacts = {
  id: string;
  title: string;
  body: string;
  disabled: boolean;
};

export type ProjectFacts = {
  id: string;
  name: string;
  address: string | null;
  stateCode: string | null;
};

export type TeamMemberFacts = {
  id: string;
  userId: string | null;
  name: string;
};

/** Names of the Department master (MR "Department"). */
export type DepartmentFacts = { id: string; name: string; disabled: boolean };

type Db = Prisma.TransactionClient;

export type ProcurementDirectory = {
  materials(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, MaterialFacts>>;
  suppliers(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, SupplierFacts>>;
  contractors(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, ContractorFacts>>;
  departments(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, DepartmentFacts>>;
  billingAddresses(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, BillingAddressFacts>>;
  /** The Company's default billing address, if it has one. */
  defaultBillingAddress(
    db: Db,
    workspaceId: string,
  ): Promise<BillingAddressFacts | null>;
  terms(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, TermsFacts>>;
  projects(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, ProjectFacts>>;
  teamMembers(
    db: Db,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, TeamMemberFacts>>;
  /** GRN fields the Company hides (Settings → GRN fields, CM-0015 §9). */
  hiddenGrnFields(db: Db, workspaceId: string): Promise<ReadonlySet<string>>;
};

/** A (location, material) pair whose stock changed in a transaction. */
export type StockKey = { location: StockLocation; materialId: string };

/**
 * Called inside the transaction after every ledger write (CM-506 owns the
 * implementation): updates `stock_settings.below_minimum` and returns
 * `StockBelowMinimum` events for crossings, dispatched after commit.
 */
export type StockLevelWatcher = {
  afterStockChanged(
    tx: Db,
    workspaceId: string,
    keys: readonly StockKey[],
  ): Promise<DomainEvent[]>;
};

export const NO_STOCK_WATCHER: StockLevelWatcher = {
  afterStockChanged: () => Promise.resolve([]),
};

/**
 * Whether a GRN is referenced by a supplier payment (M7). Until M7 exists
 * the answer is "not paid" (`NOT_PAID`), like `StructureUsage` in M4.
 */
export type GoodsReceiptPayments = {
  isPaid(db: Db, workspaceId: string, goodsReceiptId: string): Promise<boolean>;
};

export const NOT_PAID: GoodsReceiptPayments = {
  isPaid: () => Promise.resolve(false),
};
