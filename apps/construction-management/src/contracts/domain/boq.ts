import { divideRounded, pow10 } from "@/src/shared-kernel/decimal";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

import { isValidSacHsn } from "./item";
import { fixedDecimal, paise, RATE_MAX, scaledDecimal } from "./item-analysis";

/**
 * A Project's BOQ (CM-1103, ADR CM-0023 §4): ordered **sections**, each with
 * ordered **items**. An item has the number the contract prints ("2.1.3"),
 * a description, UoM, SAC/HSN, a quantity (four decimals, in its UoM) and a
 * rate (paise per UoM). Its amount is `round(quantity × rate)`, half up.
 * The item keeps what the contract said (`original*`) beside the current
 * figures, which approved Variations change.
 */

export const BOQ_SECTION_TITLE_MAX = 120;
export const BOQ_ITEM_NO_MAX = 32;
export const BOQ_ITEM_DESCRIPTION_MAX = 4000;
/** Four decimals: `DECIMAL(16,4)`. */
export const BOQ_QUANTITY_SCALE = 4;
const QUANTITY_ONE = pow10(BOQ_QUANTITY_SCALE);
/** Ten-thousandths: the largest quantity `DECIMAL(16,4)` holds is just under 10¹². */
export const BOQ_QUANTITY_MAX = pow10(16) - 1n;
/**
 * Paise: the largest line amount (₹1,000 crore), so every amount and any
 * realistic total stays exact as a JSON number.
 */
export const BOQ_AMOUNT_MAX = RATE_MAX;

function field(code: string, message: string, name: string): DomainError {
  return new DomainError(code, message, { details: { field: name } });
}

function oneLine(raw: string | null | undefined): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  return value === "" ? null : value;
}

function reference(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  return value === "" ? null : value;
}

/** A section's title: one line, required, ≤ 120. */
export function sectionTitle(raw: string): string {
  const title = oneLine(raw);
  if (title == null)
    throw field(
      "BOQ_SECTION_TITLE_REQUIRED",
      "Enter the section's title.",
      "title",
    );
  if (title.length > BOQ_SECTION_TITLE_MAX)
    throw field(
      "BOQ_SECTION_TITLE_TOO_LONG",
      `The title is at most ${String(BOQ_SECTION_TITLE_MAX)} characters.`,
      "title",
    );
  return title;
}

/** Whether two titles or item numbers collide in a Project (case and spacing ignored). */
export function sameBoqKey(a: string, b: string): boolean {
  return boqKey(a) === boqKey(b);
}

export function boqKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A quantity as ten-thousandths: more than 0, at most four decimals, below
 * 10¹² (`DECIMAL(16,4)`). Null when it is not one.
 */
export function boqQuantity(
  raw: string | number | null | undefined,
): bigint | null {
  if (raw == null || (typeof raw === "string" && raw.trim() === ""))
    return null;
  const value = scaledDecimal(raw, BOQ_QUANTITY_SCALE);
  if (value == null || value <= 0n || value > BOQ_QUANTITY_MAX) return null;
  return value;
}

/** Ten-thousandths as the API sends them: `"12.5000"`. */
export function quantityText(value: bigint): string {
  return fixedDecimal(value, BOQ_QUANTITY_SCALE);
}

/** `round(quantity × rate)` in paise, half up; the quantity in ten-thousandths. */
export function boqAmount(quantity: bigint, rate: bigint): bigint {
  return divideRounded(quantity * rate, QUANTITY_ONE);
}

export type BoqItemInput = {
  itemNo: string;
  description: string;
  uomId: string;
  sacHsn?: string | null;
  quantity: string | number;
  /** Paise per UoM. */
  rate: number | bigint;
  wingId?: string | null;
  locationId?: string | null;
};

export type BoqItemFields = {
  /** Trimmed; unique in the Project ignoring case. */
  itemNo: string;
  description: string;
  uomId: string;
  sacHsn: string | null;
  /** Ten-thousandths of the UoM. */
  quantity: bigint;
  /** Paise per UoM. */
  rate: bigint;
  wingId: string | null;
  locationId: string | null;
};

export function boqItemNo(raw: string | null | undefined): string {
  const itemNo = oneLine(raw);
  if (itemNo == null)
    throw field("BOQ_ITEM_NO_REQUIRED", "Enter the item number.", "itemNo");
  if (itemNo.length > BOQ_ITEM_NO_MAX)
    throw field(
      "BOQ_ITEM_NO_TOO_LONG",
      `The item number is at most ${String(BOQ_ITEM_NO_MAX)} characters.`,
      "itemNo",
    );
  return itemNo;
}

export function boqDescription(raw: string | null | undefined): string {
  // A schedule's wording keeps its line breaks.
  const description = raw?.trim() ?? "";
  if (description === "")
    throw field(
      "BOQ_ITEM_DESCRIPTION_REQUIRED",
      "Enter the item's description.",
      "description",
    );
  if (description.length > BOQ_ITEM_DESCRIPTION_MAX)
    throw field(
      "BOQ_ITEM_DESCRIPTION_TOO_LONG",
      `The description is at most ${BOQ_ITEM_DESCRIPTION_MAX.toLocaleString("en-IN")} characters.`,
      "description",
    );
  return description;
}

export function boqSacHsn(raw: string | null | undefined): string | null {
  const sacHsn = oneLine(raw)?.replace(/\s/g, "") ?? null;
  if (sacHsn != null && !isValidSacHsn(sacHsn))
    throw field(
      "SAC_HSN_INVALID",
      "The SAC or HSN code is 4 to 8 digits.",
      "sacHsn",
    );
  return sacHsn;
}

export function boqItemQuantity(
  raw: string | number | null | undefined,
  name = "quantity",
): bigint {
  const quantity = boqQuantity(raw);
  if (quantity == null)
    throw field(
      "BOQ_QUANTITY_INVALID",
      "The quantity is more than 0, with at most four decimals.",
      name,
    );
  return quantity;
}

export function boqItemRate(raw: number | bigint, name = "rate"): bigint {
  const rate = paise(raw);
  if (rate == null)
    throw field(
      "BOQ_RATE_INVALID",
      "The rate is an amount from ₹0 to ₹1,000 crore.",
      name,
    );
  return rate;
}

/** The amount must stay at most ₹1,000 crore (so totals stay exact). */
export function assertBoqAmount(quantity: bigint, rate: bigint): void {
  if (boqAmount(quantity, rate) > BOQ_AMOUNT_MAX)
    throw field(
      "BOQ_AMOUNT_TOO_LARGE",
      "Quantity × rate is more than ₹1,000 crore. Split the item.",
      "quantity",
    );
}

/** Checks and tidies a BOQ item's fields (not its references). */
export function boqItemFields(input: BoqItemInput): BoqItemFields {
  const itemNo = boqItemNo(input.itemNo);
  const description = boqDescription(input.description);
  const uomId = input.uomId.trim();
  if (uomId === "")
    throw field("BOQ_ITEM_UOM_REQUIRED", "Pick the item's UoM.", "uomId");
  const sacHsn = boqSacHsn(input.sacHsn);
  const quantity = boqItemQuantity(input.quantity);
  const rate = boqItemRate(input.rate);
  assertBoqAmount(quantity, rate);
  const wingId = reference(input.wingId);
  const locationId = reference(input.locationId);
  if (wingId != null && locationId != null)
    throw field(
      "BOQ_ITEM_PLACE_INVALID",
      "Name a Wing or a Location, not both.",
      "locationId",
    );
  return {
    itemNo,
    description,
    uomId,
    sacHsn,
    quantity,
    rate,
    wingId,
    locationId,
  };
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type BoqLine = { quantity: bigint; rate: bigint };

export type BoqTotals = {
  sections: Map<string, bigint>;
  total: bigint;
};

/** Each section's subtotal and the BOQ's total, from each line's rounded amount. */
export function boqTotals(
  items: readonly (BoqLine & { sectionId: string })[],
): BoqTotals {
  const sections = new Map<string, bigint>();
  let total = 0n;
  for (const item of items) {
    const amount = boqAmount(item.quantity, item.rate);
    sections.set(item.sectionId, (sections.get(item.sectionId) ?? 0n) + amount);
    total += amount;
  }
  return { sections, total };
}

/**
 * The BOQ total beside the Project's Order Value: the difference is
 * `total − orderValue` (positive when the BOQ is more). Null without an
 * Order Value.
 */
export function orderValueDifference(
  total: bigint,
  orderValue: bigint | null,
): bigint | null {
  return orderValue == null ? null : total - orderValue;
}

/**
 * The positions after moving `id` one place up or down; null at the top
 * (up) or the bottom (down), or when it is not in `order`.
 */
export function movedOrder(
  order: readonly string[],
  id: string,
  direction: "up" | "down",
): string[] | null {
  const at = order.indexOf(id);
  if (at === -1) return null;
  const to = direction === "up" ? at - 1 : at + 1;
  if (to < 0 || to >= order.length) return null;
  const next = [...order];
  const other = next[to];
  if (other == null) return null;
  next[to] = id;
  next[at] = other;
  return next;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const boqSectionNotFound = () =>
  notFound("BOQ_SECTION_NOT_FOUND", "This BOQ section was not found.");

export const boqSectionTitleTaken = (title: string) =>
  conflict(
    "BOQ_SECTION_TITLE_TAKEN",
    `The BOQ already has a section called “${title}”.`,
    { field: "title" },
  );

export const boqSectionNotEmpty = (count: number) =>
  conflict(
    "BOQ_SECTION_NOT_EMPTY",
    count === 1
      ? "This section has an item. Move or delete it first."
      : `This section has ${String(count)} items. Move or delete them first.`,
    { count },
  );

export const boqSectionChanged = () =>
  conflict(
    "BOQ_SECTION_CHANGED",
    "Someone changed this section after you opened it. Reload to see the latest.",
  );

export const boqItemNotFound = () =>
  notFound("BOQ_ITEM_NOT_FOUND", "This BOQ item was not found.");

export const boqItemNoTaken = (itemNo: string) =>
  conflict(
    "BOQ_ITEM_NO_TAKEN",
    `The BOQ already has an item numbered “${itemNo}”.`,
    { field: "itemNo" },
  );

export const boqItemChanged = () =>
  conflict(
    "BOQ_ITEM_CHANGED",
    "Someone changed this BOQ item after you opened it. Reload to see the latest.",
  );

/** A checked measurement names the item: quantity and rate change only by Variation. */
export const boqItemMeasured = () =>
  conflict(
    "BOQ_ITEM_MEASURED",
    "A checked measurement names this item, so its quantity and rate change only through a Variation, and it cannot be deleted.",
  );

export const boqItemUomInvalid = () =>
  field(
    "BOQ_ITEM_UOM_INVALID",
    "Pick a UoM from Master records → Measurement Units.",
    "uomId",
  );

export const boqItemWingInvalid = () =>
  field("BOQ_ITEM_WING_INVALID", "Pick one of this Project's Wings.", "wingId");

export const boqItemLocationInvalid = () =>
  field(
    "BOQ_ITEM_LOCATION_INVALID",
    "Pick one of this Project's Locations.",
    "locationId",
  );

export const boqLibraryItemNotFound = () =>
  new DomainError(
    "BOQ_LIBRARY_ITEM_NOT_FOUND",
    "This Item is no longer in the Item Library.",
    { details: { field: "libraryItemId" } },
  );
