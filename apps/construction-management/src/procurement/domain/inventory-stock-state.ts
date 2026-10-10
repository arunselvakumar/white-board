import { Quantity } from "@/src/shared-kernel/quantity";

/**
 * The stock state of a material at a location (ADR CM-0015 §10). It does
 * not depend on the alert toggle, which only decides whether a crossing
 * raises `StockBelowMinimum`:
 *
 * - **Out of stock** when the stock is 0 or less;
 * - **Low stock** when a minimum above 0 applies and the stock is at or
 *   below it;
 * - **In stock** otherwise.
 *
 * The dashboard (CM-510) runs the same rule in SQL.
 */
export const STOCK_STATES = ["in_stock", "low_stock", "out_of_stock"] as const;
export type StockState = (typeof STOCK_STATES)[number];

export const STOCK_STATE_LABELS: Record<StockState, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
};

const UNIT = "unit";

/** `stock` and `minimum` are decimal strings; `minimum` null when none applies. */
export function stockState(stock: string, minimum: string | null): StockState {
  const onHand = Quantity.of(stock, UNIT);
  if (!onHand.isPositive()) return "out_of_stock";
  if (minimum == null) return "in_stock";
  const floor = Quantity.of(minimum, UNIT);
  if (floor.isPositive() && onHand.compare(floor) <= 0) return "low_stock";
  return "in_stock";
}

/** The location's override when set, else the Material's minimum stock. */
export function effectiveMinimum(
  override: string | null,
  materialMinimum: string | null,
): string | null {
  return override ?? materialMinimum;
}

/**
 * Whether the stock is at or below a minimum that alerts: the toggle on and
 * a minimum above 0. The watcher compares this with the last known side.
 */
export function belowAlertingMinimum(
  stock: string,
  minimum: string | null,
  alertEnabled: boolean,
): boolean {
  if (!alertEnabled || minimum == null) return false;
  const floor = Quantity.of(minimum, UNIT);
  if (!floor.isPositive()) return false;
  return Quantity.of(stock, UNIT).compare(floor) <= 0;
}
