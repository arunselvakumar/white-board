import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { conflict, DomainError } from "@/src/shared-kernel/domain-error";
import type { LocationRef } from "@/src/shared-kernel/location-ref";
import { Quantity } from "@/src/shared-kernel/quantity";

import type { StockLocation } from "./stock-location";

/**
 * The append-only stock ledger (ADR CM-0015 §3–§5). Stock at a location is
 * the sum of its entries; a correction is a reversal plus new entries;
 * stock may never be below zero on any date.
 */

export const STOCK_ENTRY_TYPES = [
  "opening",
  "received",
  "transferred_in",
  "transferred_out",
  "issued",
  "received_from_store",
  "consumed",
  "missing",
  "adjustment",
] as const;
export type StockEntryType = (typeof STOCK_ENTRY_TYPES)[number];

/** Types that add stock; the others take it away, except an adjustment (either). */
const INWARD: ReadonlySet<StockEntryType> = new Set([
  "opening",
  "received",
  "transferred_in",
  "received_from_store",
]);

export const STOCK_ENTRY_LABELS: Record<StockEntryType, string> = {
  opening: "Opening stock",
  received: "Received",
  transferred_in: "Transferred in",
  transferred_out: "Transferred out",
  issued: "Issued",
  received_from_store: "Received from store",
  consumed: "Consumed",
  missing: "Missing",
  adjustment: "Adjustment",
};

export type StockSourceType =
  "goods_receipt" | "material_transfer" | "delivery_note" | "stock_movement";

export type StockSource = {
  type: StockSourceType;
  id: string;
};

/** One movement to post. `quantity` is the size of the movement (> 0); its
 * sign comes from `type`. An adjustment carries its own sign (≠ 0). */
export type StockPosting = {
  location: StockLocation;
  materialId: string;
  entryDate: CalendarDate;
  type: StockEntryType;
  quantity: string;
  /** Paise per unit, on Received entries. */
  unitRate?: bigint | null;
  source: StockSource;
  sourceLineId?: string | null;
  counterpartyLabel?: string | null;
  siteLocation?: LocationRef | null;
  remark?: string | null;
};

/** The signed decimal string a posting writes. */
export function signedQuantity(posting: StockPosting): string {
  // The unit does not matter for the sign; any non-empty id will do.
  const quantity = Quantity.of(posting.quantity, "unit");
  if (posting.type === "adjustment") {
    if (quantity.isZero())
      throw new DomainError(
        "QUANTITY_INVALID",
        "An adjustment must change the stock.",
      );
    return quantity.toDecimalString();
  }
  if (!quantity.isPositive())
    throw new DomainError(
      "QUANTITY_INVALID",
      "A quantity must be more than 0.",
    );
  return INWARD.has(posting.type)
    ? quantity.toDecimalString()
    : quantity.negate().toDecimalString();
}

/** Where stock would go below zero, and by how much. */
export type StockShortfall = {
  location: StockLocation;
  materialId: string;
  /** Decimal string > 0: how much is missing. */
  shortBy: string;
  /** The first date the stock would be below zero. */
  onDate: CalendarDate;
};

/**
 * 409 `STOCK_INSUFFICIENT`. `names` maps material ids to names for the
 * message; `details.shortfalls` carries every shortfall for the screen.
 */
export function stockInsufficient(
  shortfalls: readonly StockShortfall[],
  names: ReadonlyMap<string, string> = new Map(),
): DomainError {
  const [first] = shortfalls;
  const name =
    first == null ? "" : (names.get(first.materialId) ?? "a material");
  const message =
    first == null
      ? "Not enough stock."
      : `Not enough ${name} in stock: ${trimZeros(first.shortBy)} short on ${first.onDate}.`;
  return conflict("STOCK_INSUFFICIENT", message, {
    shortfalls: shortfalls.map((shortfall) => ({
      locationKind: shortfall.location.kind,
      locationId: shortfall.location.id,
      materialId: shortfall.materialId,
      materialName: names.get(shortfall.materialId) ?? null,
      shortBy: shortfall.shortBy,
      onDate: shortfall.onDate,
    })),
  });
}

function trimZeros(decimal: string): string {
  return decimal.includes(".")
    ? decimal.replace(/0+$/, "").replace(/\.$/, "")
    : decimal;
}
