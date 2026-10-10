import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type {
  StockLedgerLine,
  StockState,
} from "../domain/central-inventory";
import type { StockLocation, StockLocationKind } from "../domain/stock-location";

/** A Project or Store with its name. */
export type InventoryLocation = {
  kind: StockLocationKind;
  id: string;
  name: string;
};

/** One material at one location. */
export type InventoryPosition = {
  location: InventoryLocation;
  /** Decimal strings. */
  stock: string;
  /** Dispatched to this location (transfers, Delivery Notes), not yet delivered. */
  inTransit: string;
  /** The location's minimum, else the Material's; null when neither is set. */
  minimum: string | null;
  state: StockState;
};

export type InventoryMaterial = {
  materialId: string;
  materialName: string;
  uomName: string;
  categoryId: string | null;
  categoryName: string | null;
  /** Σ over the positions listed. */
  totalStock: string;
  totalInTransit: string;
  positions: InventoryPosition[];
};

export type CentralInventoryFilter = {
  workspaceId: string;
  /** Only these locations; every Project and Store when empty. */
  locations?: readonly StockLocation[];
  categoryId?: string;
  state?: StockState;
  /** Part of the material name. */
  search?: string;
};

export type CentralInventory = {
  /** Every live Project and Store, for the location filter. */
  locations: InventoryLocation[];
  /** By material name; positions by location kind (Projects first) then name. */
  materials: InventoryMaterial[];
};

export type StockLedgerFilter = {
  workspaceId: string;
  from: CalendarDate;
  to: CalendarDate;
  locations?: readonly StockLocation[];
  categoryId?: string;
  search?: string;
};

export type StockLedgerRow = StockLedgerLine & {
  location: InventoryLocation;
  materialId: string;
  materialName: string;
  uomName: string;
  categoryName: string | null;
};

export type StockLedgerReport = {
  from: CalendarDate;
  to: CalendarDate;
  /** By location (Projects first) then material name. */
  rows: StockLedgerRow[];
};

/** The cross-location stock reads (CM-509, ADR CM-0015 §12). */
export type CentralInventoryReader = {
  inventory(filter: CentralInventoryFilter): Promise<CentralInventory>;
  stockLedger(filter: StockLedgerFilter): Promise<StockLedgerReport>;
};

export type StockLedgerWorkbookHeader = {
  company: string;
  generatedAt: string;
  locations: string;
};

/** The Stock Ledger as an xlsx file, generated on request. */
export type StockLedgerWorkbook = {
  render(
    report: StockLedgerReport,
    header: StockLedgerWorkbookHeader,
  ): Promise<Uint8Array>;
};
