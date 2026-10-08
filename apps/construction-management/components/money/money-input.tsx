"use client";

import type { ComponentProps } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@repo/ui/components/input-group";

import { formatMinor } from "@/src/shared-kernel/money";

/** Rupees as typed: digits, an optional minus, up to two decimals. */
const RUPEES_RE = /^-?\d{1,11}(\.\d{0,2})?$/;

/** Whether `value` is an amount in rupees the API can take (`allowNegative` for balances). */
export function isRupees(value: string, allowNegative = false): boolean {
  const text = value.trim().replace(/,/g, "");
  if (!RUPEES_RE.test(text)) return false;
  return allowNegative || !text.startsWith("-");
}

/**
 * Rupees typed on a screen as integer paise for the API (ADR CM-0004: money
 * is never a float). `""` is null; anything not an amount is NaN.
 */
export function rupeesToPaise(value: string): number | null {
  const text = value.trim().replace(/,/g, "");
  if (text.length === 0) return null;
  if (!RUPEES_RE.test(text)) return Number.NaN;
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace("-", "").split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -paise : paise;
}

/** Paise from the API as rupees for an input (`150050` → `"1500.50"`, `150000` → `"1500"`). */
export function paiseToRupees(paise: number | null | undefined): string {
  if (paise == null) return "";
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const text =
    fraction === 0
      ? String(whole)
      : `${String(whole)}.${String(fraction).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

/** `₹1,00,000.00` (Indian grouping) for paise. */
export function formatPaise(paise: number): string {
  return formatMinor(paise);
}

/**
 * A rupee amount field: `₹` prefix, decimal keypad on phones. The form keeps
 * rupees as text; convert with `rupeesToPaise` when sending.
 */
export function MoneyInput({
  className,
  ...props
}: Omit<ComponentProps<typeof InputGroupInput>, "type" | "inputMode">) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon>
        <InputGroupText>₹</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        type="text"
        inputMode="decimal"
        autoComplete="off"
        {...props}
      />
    </InputGroup>
  );
}
