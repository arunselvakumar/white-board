import { invalid } from "./errors";

export const STOCK_CATEGORIES = [
  "books",
  "notebooks",
  "stationery",
  "uniform",
  "kit",
  "toys_learning_aids",
  "housekeeping",
  "furniture_equipment",
  "other",
] as const;

export type StockCategory = (typeof STOCK_CATEGORIES)[number];
export type StockItemKind = "consumable" | "asset";

export type StockItemFields = {
  name: string;
  category: StockCategory;
  /** Consumable is used up or given away; an Asset is kept. */
  kind: StockItemKind;
  /** "piece", "set", "box", "packet", "pair" */
  unit: string;
  /** At or below this a Centre is low on the item; null is never low. */
  reorderLevel: number | null;
};

function collapse(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Trims the name and unit and checks the reorder level; throws 400 otherwise. */
export function stockItemFields(input: StockItemFields): StockItemFields {
  const name = collapse(input.name);
  if (name === "")
    throw invalid("STOCK_ITEM_NAME_REQUIRED", "Enter the Stock Item's name.");
  if (name.length > 200)
    throw invalid(
      "STOCK_ITEM_NAME_TOO_LONG",
      "A Stock Item's name can be at most 200 characters.",
    );
  const unit = collapse(input.unit).toLowerCase();
  if (unit === "" || unit.length > 20)
    throw invalid(
      "STOCK_ITEM_UNIT_INVALID",
      "Enter a unit of 1 to 20 characters, such as piece or set.",
    );
  if (
    input.reorderLevel != null &&
    (!Number.isInteger(input.reorderLevel) || input.reorderLevel < 0)
  )
    throw invalid(
      "STOCK_REORDER_LEVEL_INVALID",
      "The reorder level is a whole number of zero or more.",
    );
  return { ...input, name, unit };
}
