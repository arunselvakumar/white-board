import type { StockMovementKind } from "../domain/stock";
import type { StockCategory, StockItemKind } from "../domain/stock-item";

// JSON-ready. Calendar dates are YYYY-MM-DD; money is whole paise.

export type StockItemView = {
  id: string;
  name: string;
  category: StockCategory;
  kind: StockItemKind;
  unit: string;
  reorderLevel: number | null;
  isArchived: boolean;
};

export type StockItemListView = { items: StockItemView[] };

export type StockOnHandRowView = {
  itemId: string;
  name: string;
  category: StockCategory;
  kind: StockItemKind;
  unit: string;
  reorderLevel: number | null;
  onHand: number;
  /** At or below the reorder level. */
  low: boolean;
  lastMovedOn: string | null;
};

export type StockOnHandView = {
  centreId: string;
  /** Over every Stock Item, whatever the filters: items with stock on hand. */
  itemsInStock: number;
  /** Over every Stock Item, whatever the filters: items at or below their level. */
  lowItems: number;
  items: StockOnHandRowView[];
};

export type StockMovementResultView = {
  movementIds: string[];
  /** Stock on hand after the movement, per Centre and item it touched. */
  balances: { centreId: string; itemId: string; onHand: number }[];
};

export type StockMovementView = {
  id: string;
  centreId: string;
  movedOn: string;
  kind: StockMovementKind;
  itemId: string;
  itemName: string;
  unit: string;
  /** Positive adds to stock on hand, negative takes from it. */
  quantityDelta: number;
  child: { id: string; name: string } | null;
  classroom: { id: string; name: string } | null;
  staff: { id: string; name: string } | null;
  otherCentre: { id: string; name: string } | null;
  supplierName: string | null;
  billNumber: string | null;
  unitCostPaise: number | null;
  transferId: string | null;
  note: string | null;
  recordedByName: string;
  /** Stock on hand after this movement; only when the ledger is for one item. */
  balanceAfter: number | null;
};

export type StockLedgerView = {
  items: StockMovementView[];
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: string | null;
  total: number;
};

export type ChildStockIssuedView = {
  items: {
    movementId: string;
    itemId: string;
    itemName: string;
    unit: string;
    quantity: number;
    movedOn: string;
    note: string | null;
  }[];
};
