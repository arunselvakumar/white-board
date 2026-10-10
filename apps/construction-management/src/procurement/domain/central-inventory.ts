import { Quantity } from "@/src/shared-kernel/quantity";

import { STOCK_ENTRY_TYPES, type StockEntryType } from "./stock-ledger";

/**
 * Central Inventory (ADR CM-0015 §10, §12): stock per material at every
 * Project and Store, and the Stock Ledger for a period.
 */

// One stock-state rule for Current Inventory, Central Inventory and store
// stock (the dashboard SQL mirrors it): defined in inventory-stock-state.
export {
  STOCK_STATES,
  STOCK_STATE_LABELS,
  stockState,
  type StockState,
} from "./inventory-stock-state";

export function sumQuantities(values: readonly string[]): string {
  return values
    .reduce(
      (sum, value) => sum.add(Quantity.of(value, "unit")),
      Quantity.zero("unit"),
    )
    .toDecimalString();
}

/** Movements of one material at one location in a period, by entry type. */
export type LedgerMovements = Record<StockEntryType, string>;

export type StockLedgerLine = {
  opening: string;
  movements: LedgerMovements;
  closing: string;
};

/**
 * Opening plus every movement is the closing. Reversals carry their
 * entry's type with the opposite sign, so a type's figure is net of them.
 */
export function stockLedgerLine(
  opening: string,
  byType: ReadonlyMap<StockEntryType, string>,
): StockLedgerLine {
  const movements = Object.fromEntries(
    STOCK_ENTRY_TYPES.map((type) => [
      type,
      Quantity.of(byType.get(type) ?? "0", "unit").toDecimalString(),
    ]),
  ) as LedgerMovements;
  return {
    opening: Quantity.of(opening, "unit").toDecimalString(),
    movements,
    closing: sumQuantities([opening, ...Object.values(movements)]),
  };
}
