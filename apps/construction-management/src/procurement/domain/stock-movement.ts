import type { BackdatedModuleKey } from "@/src/shared-kernel/backdated-policy";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { Quantity } from "@/src/shared-kernel/quantity";

import type { StockEntryType } from "./stock-ledger";

/**
 * A hand-entered movement on Current Inventory (CM-506): Consume, Missing,
 * Adjust stock, and the Opening stock Import posts. Each is one
 * `stock_movements` row whose ledger entries name it as their source.
 */
export const STOCK_MOVEMENT_KINDS = [
  "opening",
  "consumed",
  "missing",
  "adjustment",
] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

export const STOCK_MOVEMENT_LABELS: Record<StockMovementKind, string> = {
  opening: "Opening stock",
  consumed: "Consumed",
  missing: "Missing",
  adjustment: "Adjustment",
};

/** Lines in one Consume or Missing entry. */
export const MAX_MOVEMENT_LINES = 100;

/** `decimal(14,3)`: eleven whole digits. */
const MAX_MILLI = 100_000_000_000_000n;

const UNIT = "unit";

export function movementEntryType(kind: StockMovementKind): StockEntryType {
  return kind;
}

/** The back-dated module each kind's date is checked against (CM-113). */
export function movementBackdatedModule(
  kind: StockMovementKind,
): BackdatedModuleKey {
  switch (kind) {
    case "consumed":
      return "material_consumed";
    case "missing":
      return "missing_material";
    case "opening":
    case "adjustment":
      return "current_inventory";
  }
}

/** Consumed, Missing and Opening can be edited; an adjustment is deleted and made again. */
export function isEditableMovement(kind: StockMovementKind): boolean {
  return kind !== "adjustment";
}

/** Whether a kind takes a site location (`LocationRef`) on a Project. */
export function takesSiteLocation(kind: StockMovementKind): boolean {
  return kind === "consumed";
}

function quantityError(field: string, message: string): DomainError {
  return new DomainError("QUANTITY_INVALID", message, { details: { field } });
}

function parse(raw: string, field: string): Quantity {
  let quantity: Quantity;
  try {
    quantity = Quantity.of(raw, UNIT);
  } catch {
    throw quantityError(
      field,
      "Enter a quantity with at most 3 decimal places.",
    );
  }
  const milli = quantity.toMilli();
  if ((milli < 0n ? -milli : milli) >= MAX_MILLI)
    throw new DomainError("QUANTITY_TOO_LARGE", "This quantity is too large.", {
      details: { field },
    });
  return quantity;
}

/** A movement's size: more than 0, at most 3 decimals; as `12.500`. */
export function movementQuantity(raw: string, field = "quantity"): string {
  const quantity = parse(raw, field);
  if (!quantity.isPositive())
    throw quantityError(field, "Enter a quantity more than 0.");
  return quantity.toDecimalString();
}

/** A quantity that may be 0 (counted stock, Estimated Qty, a minimum). */
export function nonNegativeQuantity(raw: string, field: string): string {
  const quantity = parse(raw, field);
  if (quantity.isNegative()) throw quantityError(field, "Enter 0 or more.");
  return quantity.toDecimalString();
}

/**
 * Adjust stock: the counted quantity less the stock on that date, signed.
 * 400 `ADJUSTMENT_NO_CHANGE` when they already agree.
 */
export function adjustmentDifference(counted: string, stock: string): string {
  const difference = Quantity.of(
    nonNegativeQuantity(counted, "countedQty"),
    UNIT,
  ).subtract(Quantity.of(stock, UNIT));
  if (difference.isZero())
    throw new DomainError(
      "ADJUSTMENT_NO_CHANGE",
      "The counted quantity is the stock already; nothing to adjust.",
      { details: { field: "countedQty" } },
    );
  return difference.toDecimalString();
}

/** Movements are dated today or earlier (Company time zone). */
export function assertMovementDate(
  date: CalendarDate,
  today: CalendarDate,
  field = "date",
): void {
  if (date > today)
    throw new DomainError(
      "STOCK_MOVEMENT_DATE_IN_FUTURE",
      "The date cannot be after today.",
      { details: { field } },
    );
}
