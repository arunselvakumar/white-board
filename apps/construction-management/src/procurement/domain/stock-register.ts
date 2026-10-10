import { Quantity } from "@/src/shared-kernel/quantity";

import type { StockEntryType } from "./stock-ledger";

/**
 * The Stock Register of a location for a date range (CM-506): per material
 * the stock before the range, what moved in it by entry type, and the
 * stock at its end. Reversals carry their entry's type with the opposite
 * sign, so an edited or deleted movement nets out in its own column.
 */
export const STOCK_REGISTER_COLUMNS = [
  "opening",
  "received",
  "transferredIn",
  "transferredOut",
  "issued",
  "receivedFromStore",
  "consumed",
  "missing",
  "adjustment",
  "closing",
] as const;
export type StockRegisterColumn = (typeof STOCK_REGISTER_COLUMNS)[number];

export const STOCK_REGISTER_LABELS: Record<StockRegisterColumn, string> = {
  opening: "Opening",
  received: "Received",
  transferredIn: "Transferred in",
  transferredOut: "Transferred out",
  issued: "Issued",
  receivedFromStore: "Received from store",
  consumed: "Consumed",
  missing: "Missing",
  adjustment: "Adjustment",
  closing: "Closing",
};

/** Decimal strings. Outflows are shown as positive quantities; an adjustment keeps its sign. */
export type StockRegisterFigures = Record<StockRegisterColumn, string>;

const UNIT = "unit";

/** Entry types whose column shows the quantity going out, as a positive number. */
const OUTWARD: ReadonlySet<StockEntryType> = new Set([
  "transferred_out",
  "issued",
  "consumed",
  "missing",
]);

const COLUMN_OF: Record<
  Exclude<StockEntryType, "opening">,
  StockRegisterColumn
> = {
  received: "received",
  transferred_in: "transferredIn",
  transferred_out: "transferredOut",
  issued: "issued",
  received_from_store: "receivedFromStore",
  consumed: "consumed",
  missing: "missing",
  adjustment: "adjustment",
};

/**
 * One material's row. `before` is the stock on the day before the range;
 * `moved` the signed sum of entries in the range by type. Opening stock
 * entries dated inside the range (an import) count towards Opening.
 */
export function stockRegisterRow(
  before: string,
  moved: Partial<Record<StockEntryType, string>>,
): StockRegisterFigures {
  const q = (value: string | undefined) => Quantity.of(value ?? "0", UNIT);
  const opening = q(before).add(q(moved.opening));
  const figures = {
    opening: opening.toDecimalString(),
    closing: "0.000",
  } as StockRegisterFigures;
  let closing = opening;
  for (const [type, column] of Object.entries(COLUMN_OF) as [
    Exclude<StockEntryType, "opening">,
    StockRegisterColumn,
  ][]) {
    const sum = q(moved[type]);
    closing = closing.add(sum);
    figures[column] = (
      OUTWARD.has(type) ? sum.negate() : sum
    ).toDecimalString();
  }
  figures.closing = closing.toDecimalString();
  return figures;
}
