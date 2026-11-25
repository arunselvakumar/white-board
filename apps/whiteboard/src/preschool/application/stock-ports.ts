import type { StockMovementKind } from "../domain/stock";
import type { StockItemFields } from "../domain/stock-item";
import type {
  ChildStockIssuedView,
  StockItemView,
  StockLedgerView,
  StockOnHandRowView,
} from "./stock-views";

export type StockItemStore = {
  /** By category, then name. */
  list(workspaceId: string, includeArchived: boolean): Promise<StockItemView[]>;
  find(workspaceId: string, id: string): Promise<StockItemView | null>;
  /** Another Stock Item that is not archived has this name, ignoring case. */
  nameTaken(
    workspaceId: string,
    name: string,
    exceptId?: string,
  ): Promise<boolean>;
  create(workspaceId: string, fields: StockItemFields): Promise<StockItemView>;
  update(
    workspaceId: string,
    id: string,
    fields: StockItemFields,
  ): Promise<StockItemView>;
  setArchivedAt(
    workspaceId: string,
    id: string,
    archivedAt: Date | null,
  ): Promise<StockItemView>;
};

export type NewStockMovement = {
  centreId: string;
  itemId: string;
  kind: StockMovementKind;
  quantityDelta: number;
  movedOn: string;
  supplierName?: string | null;
  billNumber?: string | null;
  unitCostPaise?: number | null;
  childId?: string | null;
  classroomId?: string | null;
  staffId?: string | null;
  transferId?: string | null;
  otherCentreId?: string | null;
  note?: string | null;
  recordedByUserId: string;
  recordedByName: string;
};

export type StockLedgerQuery = {
  centreId: string;
  itemId: string | null;
  childId: string | null;
  kind: StockMovementKind | null;
  from: string | null;
  to: string | null;
  limit: number;
  cursor: string | null;
};

export type StockStore = {
  /** Every Stock Item that is not archived, with its stock at the Centre. */
  onHand(
    workspaceId: string,
    centreId: string,
  ): Promise<Omit<StockOnHandRowView, "low">[]>;
  items(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<{ id: string; name: string; unit: string; isArchived: boolean }[]>;
  centre(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; name: string } | null>;
  /** A Child that is not deleted, with the Classroom of the active Admission. */
  child(
    workspaceId: string,
    id: string,
  ): Promise<{
    id: string;
    centreId: string;
    name: string;
    classroomId: string | null;
  } | null>;
  classroom(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; centreId: string; name: string } | null>;
  staff(
    workspaceId: string,
    id: string,
  ): Promise<{ id: string; centreId: string; name: string } | null>;
  /**
   * In one transaction: locks each Centre and item the movements touch,
   * reads stock on hand, lets `check` refuse a movement (it may throw), and
   * writes them. Returns the ids and stock on hand afterwards.
   */
  record(
    workspaceId: string,
    movements: readonly NewStockMovement[],
    check: (movement: NewStockMovement, onHand: number) => void,
  ): Promise<{
    movementIds: string[];
    balances: { centreId: string; itemId: string; onHand: number }[];
  }>;
  /** Newest first; a running balance when `itemId` is given. */
  ledger(
    workspaceId: string,
    query: StockLedgerQuery,
  ): Promise<StockLedgerView>;
  /** What a Child has been issued, newest first. */
  childIssued(
    workspaceId: string,
    childId: string,
  ): Promise<ChildStockIssuedView>;
};
