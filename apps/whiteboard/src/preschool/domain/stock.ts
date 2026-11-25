import { conflict, invalid } from "./errors";

export type StockMovementKind =
  | "received"
  | "issued_to_child"
  | "issued_to_classroom"
  | "issued_to_staff"
  | "transfer_out"
  | "transfer_in"
  | "adjusted";

const ADDS = new Set<StockMovementKind>(["received", "transfer_in"]);
const TAKES = new Set<StockMovementKind>([
  "issued_to_child",
  "issued_to_classroom",
  "issued_to_staff",
  "transfer_out",
]);

/**
 * The signed change a movement makes to stock on hand. `quantity` is what the
 * User typed: a count above zero, or for an adjustment the signed correction
 * (−3 for three damaged, +2 for two found).
 */
export function quantityDelta(
  kind: StockMovementKind,
  quantity: number,
): number {
  if (!Number.isInteger(quantity) || quantity === 0)
    throw invalid("STOCK_QUANTITY_INVALID", "Enter a whole quantity.");
  if (kind === "adjusted") return quantity;
  if (quantity < 0)
    throw invalid("STOCK_QUANTITY_INVALID", "Enter a quantity above zero.");
  if (ADDS.has(kind)) return quantity;
  if (TAKES.has(kind)) return -quantity;
  throw invalid("STOCK_MOVEMENT_KIND_INVALID", "Unknown Stock Movement.");
}

/** Stock on hand never goes below zero. */
export function assertEnoughStock(
  onHand: number,
  delta: number,
  item: { name: string; unit: string },
): void {
  if (onHand + delta < 0)
    throw conflict(
      "STOCK_INSUFFICIENT",
      `Only ${onHand} ${item.unit} of ${item.name} in stock at this Centre.`,
      { onHand },
    );
}

/** At or below the reorder level. An item with no level is never low. */
export function isLowStock(
  onHand: number,
  reorderLevel: number | null,
): boolean {
  return reorderLevel != null && onHand <= reorderLevel;
}
