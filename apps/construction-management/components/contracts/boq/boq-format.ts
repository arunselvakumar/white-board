import { formatPaise } from "@/components/money/money-input";
import type { VariationKind } from "@/src/contracts/domain/variation";
import type { Variation } from "@/src/queries/contracts-boq";

/** `₹1,28,617.75`, or "—" when the caller cannot see it. */
export function money(paise: number | null | undefined): string {
  return paise == null ? "—" : formatPaise(paise);
}

/** A signed difference: `+₹4,500.00` or `−₹2,000.00`. */
export function signedMoney(paise: number | null | undefined): string {
  if (paise == null) return "—";
  if (paise === 0) return formatPaise(0);
  return `${paise > 0 ? "+" : "−"}${formatPaise(Math.abs(paise))}`;
}

/**
 * A four-place quantity from the API with its trailing zeros dropped and
 * Indian grouping: `"1250.5000"` → `"1,250.5"`.
 */
export function quantity(text: string | null | undefined): string {
  if (text == null) return "—";
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace("-", "").split(".");
  const grouped = BigInt(whole).toLocaleString("en-IN");
  const tail = fraction.replace(/0+$/, "");
  return `${negative ? "−" : ""}${grouped}${tail === "" ? "" : `.${tail}`}`;
}

/** A quantity as an input value: `"450.0000"` → `"450"`. */
export function quantityInput(text: string | null | undefined): string {
  if (text == null) return "";
  return quantity(text).replace(/,/g, "").replace("−", "-");
}

export const KIND_LABELS: Record<VariationKind, string> = {
  extra_item: "Extra item",
  quantity: "Quantity change",
  rate: "Rate change",
};

/** What a Variation changes, in one line: `100 → 130 cum`, `₹450.00 → ₹475.50`. */
export function variationChange(variation: Variation): string {
  const uom = variation.uomName == null ? "" : ` ${variation.uomName}`;
  switch (variation.kind) {
    case "quantity":
      return `${quantity(variation.previousQuantity)} → ${quantity(variation.newQuantity)}${uom}`;
    case "rate":
      return `${money(variation.previousRate)} → ${money(variation.newRate)}`;
    case "extra_item":
      return `${quantity(variation.newQuantity)}${uom} at ${money(variation.newRate)}`;
  }
}
