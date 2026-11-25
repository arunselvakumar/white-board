import type { IsoDate } from "./dates";
import { invalid } from "./errors";

/** A movement's date: today unless given, and never in the future. */
export function stockMovedOn(
  movedOn: IsoDate | undefined,
  today: IsoDate,
): IsoDate {
  const date = movedOn ?? today;
  if (date > today)
    throw invalid("STOCK_DATE_IN_FUTURE", "The date cannot be in the future.");
  return date;
}

/** One line per item: a bill or an issue lists each item once. */
export function assertStockLines(lines: readonly { itemId: string }[]): void {
  if (lines.length === 0)
    throw invalid("STOCK_LINES_REQUIRED", "Add at least one item.");
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.itemId))
      throw invalid(
        "STOCK_DUPLICATE_ITEM",
        "Each item can be listed only once.",
      );
    seen.add(line.itemId);
  }
}

/**
 * The balance after each movement of one item at one Centre.
 * @param movements oldest first
 */
export function runningBalances(
  movements: readonly { id: string; quantityDelta: number }[],
): Map<string, number> {
  const balances = new Map<string, number>();
  let balance = 0;
  for (const movement of movements) {
    balance += movement.quantityDelta;
    balances.set(movement.id, balance);
  }
  return balances;
}
