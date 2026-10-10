import { divideRounded, parseDecimal, pow10 } from "./decimal";
import { DomainError } from "./domain-error";
import { QUANTITY_SCALE } from "./quantity";

/**
 * Line and document math for Purchase Orders and Goods Receipts (ADR
 * CM-0015 §6). Pure and exact (bigint paise, decimal strings), so the
 * browser shows exactly what the server stores. Every line rounds half up
 * to the paisa on its own; totals are sums of rounded lines.
 */

/** CGST + SGST (intra-state) or IGST (inter-state). */
export type SupplyType = "intra_state" | "inter_state";

export type LineDiscount =
  | { type: "amount"; paise: bigint }
  | { type: "percent"; percent: string }
  | null;

export type LineInput = {
  /** Decimal string, at most three decimals, > 0. */
  quantity: string;
  /** Paise per unit, ≥ 0. */
  unitRate: bigint;
  discount?: LineDiscount;
  /** Percent as a decimal string, 0–100, at most two decimals. */
  gstRate?: string;
};

export type LineAmounts = {
  subTotal: bigint;
  discountAmount: bigint;
  taxable: bigint;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  /** taxable + GST. */
  total: bigint;
};

export type DocumentTotals = {
  subTotal: bigint;
  discountTotal: bigint;
  taxableTotal: bigint;
  cgstTotal: bigint;
  sgstTotal: bigint;
  igstTotal: bigint;
  /** Σ line totals. */
  itemsTotal: bigint;
  additionalCharges: bigint;
  deductionAmount: bigint;
  /** itemsTotal + additionalCharges − deductionAmount. */
  grandTotal: bigint;
};

/** A percent as hundredths (`"18"` → 1800n), checked 0–100. */
export function percentHundredths(raw: string, code: string): bigint {
  let parsed: { numerator: bigint; scale: number };
  try {
    parsed = parseDecimal(raw);
  } catch {
    throw new DomainError(code, "Enter a percent between 0 and 100.");
  }
  if (parsed.scale > 2)
    throw new DomainError(code, "A percent has at most two decimals.");
  const hundredths = parsed.numerator * pow10(2 - parsed.scale);
  if (hundredths < 0n || hundredths > 10_000n)
    throw new DomainError(code, "Enter a percent between 0 and 100.");
  return hundredths;
}

function quantityMilli(raw: string): bigint {
  let parsed: { numerator: bigint; scale: number };
  try {
    parsed = parseDecimal(raw);
  } catch {
    throw new DomainError("QUANTITY_INVALID", "Enter a quantity.");
  }
  if (parsed.scale > QUANTITY_SCALE)
    throw new DomainError(
      "QUANTITY_INVALID",
      "A quantity has at most three decimals.",
    );
  const milli = parsed.numerator * pow10(QUANTITY_SCALE - parsed.scale);
  if (milli <= 0n)
    throw new DomainError(
      "QUANTITY_INVALID",
      "A quantity must be more than 0.",
    );
  return milli;
}

/** GST split: CGST takes the odd paisa. */
export function splitGst(
  gst: bigint,
  supplyType: SupplyType,
): Pick<LineAmounts, "cgst" | "sgst" | "igst"> {
  if (supplyType === "inter_state") return { cgst: 0n, sgst: 0n, igst: gst };
  const sgst = gst / 2n;
  return { cgst: gst - sgst, sgst, igst: 0n };
}

export function lineAmounts(
  line: LineInput,
  supplyType: SupplyType,
): LineAmounts {
  if (line.unitRate < 0n)
    throw new DomainError("UNIT_RATE_INVALID", "A rate cannot be negative.");
  const milli = quantityMilli(line.quantity);
  const subTotal = divideRounded(milli * line.unitRate, pow10(QUANTITY_SCALE));

  let discountAmount = 0n;
  const discount = line.discount ?? null;
  if (discount?.type === "amount") {
    if (discount.paise < 0n)
      throw new DomainError(
        "DISCOUNT_INVALID",
        "A discount cannot be negative.",
      );
    discountAmount = discount.paise;
  } else if (discount?.type === "percent") {
    const hundredths = percentHundredths(discount.percent, "DISCOUNT_INVALID");
    discountAmount = divideRounded(subTotal * hundredths, 10_000n);
  }
  if (discountAmount > subTotal)
    throw new DomainError(
      "DISCOUNT_TOO_LARGE",
      "A discount cannot be more than the line's amount.",
    );

  const taxable = subTotal - discountAmount;
  const rate = percentHundredths(line.gstRate ?? "0", "GST_RATE_INVALID");
  const gst = divideRounded(taxable * rate, 10_000n);
  return {
    subTotal,
    discountAmount,
    taxable,
    ...splitGst(gst, supplyType),
    total: taxable + gst,
  };
}

export function documentTotals(
  lines: readonly LineAmounts[],
  charges: { additionalCharges?: bigint; deductionAmount?: bigint } = {},
): DocumentTotals {
  const additionalCharges = charges.additionalCharges ?? 0n;
  const deductionAmount = charges.deductionAmount ?? 0n;
  if (additionalCharges < 0n || deductionAmount < 0n)
    throw new DomainError(
      "CHARGES_INVALID",
      "Charges and deductions cannot be negative.",
    );
  const sum = (pick: (line: LineAmounts) => bigint) =>
    lines.reduce((total, line) => total + pick(line), 0n);
  const itemsTotal = sum((line) => line.total);
  const grandTotal = itemsTotal + additionalCharges - deductionAmount;
  if (grandTotal < 0n)
    throw new DomainError(
      "DEDUCTION_TOO_LARGE",
      "The deduction cannot be more than the order's total.",
    );
  return {
    subTotal: sum((line) => line.subTotal),
    discountTotal: sum((line) => line.discountAmount),
    taxableTotal: sum((line) => line.taxable),
    cgstTotal: sum((line) => line.cgst),
    sgstTotal: sum((line) => line.sgst),
    igstTotal: sum((line) => line.igst),
    itemsTotal,
    additionalCharges,
    deductionAmount,
    grandTotal,
  };
}

/** A GSTIN's state: its first two digits. */
export function gstinStateCode(
  gstin: string | null | undefined,
): string | null {
  if (gstin == null || gstin.length < 2) return null;
  return gstin.slice(0, 2);
}

/**
 * The default supply type: intra-state when the supplier's state equals the
 * place of supply, inter-state when both are known and differ, intra-state
 * when either is unknown (CM-0015 §6).
 */
export function defaultSupplyType(
  supplierStateCode: string | null | undefined,
  placeOfSupplyStateCode: string | null | undefined,
): SupplyType {
  if (supplierStateCode == null || placeOfSupplyStateCode == null)
    return "intra_state";
  return supplierStateCode === placeOfSupplyStateCode
    ? "intra_state"
    : "inter_state";
}
