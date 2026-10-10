import { normalizeMobile } from "@repo/auth/construction/mobile";

import { optionalText } from "@/src/shared-kernel/approval";
import {
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { divideRounded } from "@/src/shared-kernel/decimal";
import { DomainError } from "@/src/shared-kernel/domain-error";
import {
  documentTotals,
  lineAmounts,
  type LineAmounts,
  type SupplyType,
} from "@/src/shared-kernel/gst-line";
import { Quantity } from "@/src/shared-kernel/quantity";

/**
 * Goods Receipt (GRN / Material Received, CM-505, ADR CM-0015 §9): what
 * arrived from a supplier at a Project or a Store, with or without a
 * Purchase Order. A record of fact: no approval. Posting it adds stock on
 * the Inventory Date; the rules here are pure, the transaction lives in
 * the application service.
 */

/** The optional fields a Company can hide (Settings → GRN fields). */
export const GRN_OPTIONAL_FIELDS = [
  "invoiceNo",
  "invoiceDate",
  "invoiceAmount",
  "deliveryChallanNo",
  "grnDcNo",
  "vehicleNo",
  "driverName",
  "driverMobile",
  "ewayBillNo",
  "remark",
] as const;
export type GrnOptionalField = (typeof GRN_OPTIONAL_FIELDS)[number];

export const GOODS_RECEIPT_LIMITS = {
  maxLines: 200,
  /** Numbers and names in the Supplier and Delivery details. */
  maxText: 100,
} as const;

export const GOODS_RECEIPT_NAMING = {
  code: "GOODS_RECEIPT",
  label: "Goods Receipt",
} as const;

export type ReceiptStatus = "not_received" | "partially_received" | "received";

/** Supplier details and Delivery details (CM-0015 §9) plus the remark. */
export type GoodsReceiptDetails = {
  invoiceNo: string | null;
  invoiceDate: CalendarDate | null;
  /** Paise. */
  invoiceAmount: bigint | null;
  deliveryChallanNo: string | null;
  grnDcNo: string | null;
  vehicleNo: string | null;
  driverName: string | null;
  /** E.164, `+91…`. */
  driverMobile: string | null;
  ewayBillNo: string | null;
  remark: string | null;
};

export type RawGoodsReceiptDetails = {
  invoiceNo?: string | null;
  invoiceDate?: CalendarDate | null;
  invoiceAmount?: number | null;
  deliveryChallanNo?: string | null;
  grnDcNo?: string | null;
  vehicleNo?: string | null;
  driverName?: string | null;
  driverMobile?: string | null;
  ewayBillNo?: string | null;
  remark?: string | null;
};

export const EMPTY_DETAILS: GoodsReceiptDetails = {
  invoiceNo: null,
  invoiceDate: null,
  invoiceAmount: null,
  deliveryChallanNo: null,
  grnDcNo: null,
  vehicleNo: null,
  driverName: null,
  driverMobile: null,
  ewayBillNo: null,
  remark: null,
};

function shortText(raw: string | null | undefined, field: string) {
  const text = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (text.length > GOODS_RECEIPT_LIMITS.maxText)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(GOODS_RECEIPT_LIMITS.maxText)} characters.`,
      { details: { field } },
    );
  return text === "" ? null : text;
}

/** An Indian mobile in any common form, as E.164; null when empty. */
export function driverMobile(raw: string | null | undefined): string | null {
  const text = raw?.trim() ?? "";
  if (text === "") return null;
  const mobile = normalizeMobile(text);
  if (mobile == null || !/^\+91[6-9]\d{9}$/.test(mobile))
    throw new DomainError(
      "DRIVER_MOBILE_INVALID",
      "Enter a 10-digit Indian mobile number, like 77081 65767.",
      { details: { field: "driverMobile" } },
    );
  return mobile;
}

/** An e-way bill number: 12 digits (spaces allowed while typing). */
export function ewayBillNo(raw: string | null | undefined): string | null {
  const text = raw?.replace(/\s+/g, "") ?? "";
  if (text === "") return null;
  if (!/^\d{12}$/.test(text))
    throw new DomainError(
      "EWAY_BILL_NO_INVALID",
      "An e-way bill number has 12 digits.",
      { details: { field: "ewayBillNo" } },
    );
  return text;
}

/**
 * The details to store. A field the Company hides keeps what is stored
 * (nothing on a new GRN): a hidden field is neither shown nor required,
 * and hiding it later never wipes it. Without Financial the invoice
 * amount is not the caller's to change either.
 */
export function goodsReceiptDetails(
  raw: RawGoodsReceiptDetails,
  options: {
    hidden: ReadonlySet<string>;
    financial: boolean;
    stored: GoodsReceiptDetails | null;
  },
): GoodsReceiptDetails {
  const stored = options.stored ?? EMPTY_DETAILS;
  let invoiceAmount: bigint | null = null;
  if (raw.invoiceAmount != null) {
    if (!Number.isSafeInteger(raw.invoiceAmount) || raw.invoiceAmount < 0)
      throw new DomainError(
        "INVOICE_AMOUNT_INVALID",
        "Enter the invoice amount in rupees, 0 or more.",
        { details: { field: "invoiceAmount" } },
      );
    invoiceAmount = BigInt(raw.invoiceAmount);
  }
  const typed: GoodsReceiptDetails = {
    invoiceNo: shortText(raw.invoiceNo, "invoiceNo"),
    invoiceDate: raw.invoiceDate ?? null,
    invoiceAmount,
    deliveryChallanNo: shortText(raw.deliveryChallanNo, "deliveryChallanNo"),
    grnDcNo: shortText(raw.grnDcNo, "grnDcNo"),
    vehicleNo: shortText(raw.vehicleNo, "vehicleNo")?.toUpperCase() ?? null,
    driverName: shortText(raw.driverName, "driverName"),
    driverMobile: options.hidden.has("driverMobile")
      ? null
      : driverMobile(raw.driverMobile),
    ewayBillNo: options.hidden.has("ewayBillNo")
      ? null
      : ewayBillNo(raw.ewayBillNo),
    remark: optionalText(raw.remark, "remark"),
  };
  const result = { ...typed };
  for (const field of GRN_OPTIONAL_FIELDS)
    if (options.hidden.has(field))
      (result as Record<GrnOptionalField, unknown>)[field] = stored[field];
  if (!options.financial) result.invoiceAmount = stored.invoiceAmount;
  return result;
}

/**
 * GR Date and Inventory Date (the date the stock is posted): neither after
 * the Company's today, and stock cannot be in before it was received.
 */
export function assertReceiptDates(
  receiptDate: CalendarDate,
  inventoryDate: CalendarDate,
  today: CalendarDate,
): void {
  if (daysBetween(today, receiptDate) > 0)
    throw new DomainError(
      "GOODS_RECEIPT_DATE_IN_FUTURE",
      "The GR Date cannot be after today.",
      { details: { field: "receiptDate" } },
    );
  if (daysBetween(today, inventoryDate) > 0)
    throw new DomainError(
      "INVENTORY_DATE_IN_FUTURE",
      "The Inventory Date cannot be after today.",
      { details: { field: "inventoryDate" } },
    );
  if (daysBetween(receiptDate, inventoryDate) < 0)
    throw new DomainError(
      "INVENTORY_DATE_BEFORE_RECEIPT",
      "The Inventory Date cannot be before the GR Date.",
      { details: { field: "inventoryDate" } },
    );
}

/** A received quantity: > 0, at most three decimals, as `12.500`. */
export function receivedQuantity(raw: string): string {
  let quantity: Quantity;
  try {
    quantity = Quantity.of(raw, "unit");
  } catch {
    throw new DomainError(
      "QUANTITY_INVALID",
      "Enter a quantity with at most three decimals.",
    );
  }
  if (!quantity.isPositive())
    throw new DomainError(
      "QUANTITY_INVALID",
      "A quantity must be more than 0.",
    );
  return quantity.toDecimalString();
}

/** A GRN line has no discount: qty × rate, then GST (CM-0015 §6). */
export function receiptLineAmounts(
  line: { quantity: string; unitRate: bigint; gstRate: string },
  supplyType: SupplyType,
): LineAmounts {
  return lineAmounts(
    { quantity: line.quantity, unitRate: line.unitRate, gstRate: line.gstRate },
    supplyType,
  );
}

export type ReceiptTotals = {
  taxableTotal: bigint;
  cgstTotal: bigint;
  sgstTotal: bigint;
  igstTotal: bigint;
  /** Σ line totals including GST: the GRN's value (CM-0015 §6). */
  totalValue: bigint;
};

export function receiptTotals(lines: readonly LineAmounts[]): ReceiptTotals {
  const totals = documentTotals(lines);
  return {
    taxableTotal: totals.taxableTotal,
    cgstTotal: totals.cgstTotal,
    sgstTotal: totals.sgstTotal,
    igstTotal: totals.igstTotal,
    totalValue: totals.itemsTotal,
  };
}

/**
 * The rate a GRN line takes from its PO line: the PO's taxable value per
 * unit (its discount spread over the quantity), rounded half up to the
 * paisa. A GRN line has no discount column, so a full receipt is valued
 * as the PO line was.
 */
export function netUnitRate(order: { quantity: string; taxable: bigint }) {
  const milli = Quantity.of(order.quantity, "unit").toMilli();
  if (milli <= 0n) return 0n;
  return divideRounded(order.taxable * 1000n, milli);
}

/** Thousandths, for exact comparison of decimal-string quantities. */
function milli(quantity: string): bigint {
  return Quantity.of(quantity, "unit").toMilli();
}

function decimal(milliValue: bigint): string {
  const negative = milliValue < 0n;
  const digits = (negative ? -milliValue : milliValue)
    .toString()
    .padStart(4, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -3)}.${digits.slice(-3)}`;
}

/** Received beyond ordered ("Excess received"), or null when none. */
export function excessQuantity(
  ordered: string,
  received: string,
): string | null {
  const excess = milli(received) - milli(ordered);
  return excess > 0n ? decimal(excess) : null;
}

/** Ordered still to come (0 when received in full or more). */
export function pendingQuantity(ordered: string, received: string): string {
  const pending = milli(ordered) - milli(received);
  return decimal(pending > 0n ? pending : 0n);
}

/** a + b of decimal-string quantities. */
export function addQuantities(a: string, b: string): string {
  return decimal(milli(a) + milli(b));
}

/**
 * A PO's receipt status from its lines' ordered and received quantities:
 * received when every line is received in full (an excess counts as
 * received), partially when anything arrived, else not received.
 */
export function receiptStatus(
  lines: readonly { ordered: string; received: string }[],
): ReceiptStatus {
  if (lines.length === 0) return "not_received";
  const full = lines.every(
    (line) => milli(line.received) >= milli(line.ordered),
  );
  if (full) return "received";
  return lines.some((line) => milli(line.received) > 0n)
    ? "partially_received"
    : "not_received";
}
