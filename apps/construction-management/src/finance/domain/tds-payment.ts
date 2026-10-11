import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { fiscalYearOf } from "@/src/shared-kernel/sequence/fiscal-year";

import { optionalText, PARTY_TEXT_LIMITS } from "./party";
import type { TdsSuggestion } from "./tds";

/**
 * TDS on a Contractor payment as recorded (ADR CM-0017 §8): the server's
 * suggestion is kept beside what the accountant deducted, and a different
 * amount needs a reason. The TDS ledger groups payments by financial year
 * and quarter.
 */

/** 1 April of `startYear` to 31 March of the next year. */
export function financialYearRange(startYear: number): {
  from: CalendarDate;
  to: CalendarDate;
} {
  return {
    from: `${String(startYear)}-04-01`,
    to: `${String(startYear + 1)}-03-31`,
  };
}

/** The financial year (its start year) a date falls in. */
export function financialYearOf(date: CalendarDate): number {
  return fiscalYearOf(date).startYear;
}

/** Q1 April–June, Q2 July–September, Q3 October–December, Q4 January–March. */
export function quarterOf(date: CalendarDate): 1 | 2 | 3 | 4 {
  const month = Number(assertCalendarDate(date).slice(5, 7));
  if (month >= 4 && month <= 6) return 1;
  if (month >= 7 && month <= 9) return 2;
  if (month >= 10) return 3;
  return 4;
}

export const QUARTER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "Q1 (Apr–Jun)",
  2: "Q2 (Jul–Sep)",
  3: "Q3 (Oct–Dec)",
  4: "Q4 (Jan–Mar)",
};

/**
 * The GST share of what a payment settles: for each allocated invoice that
 * carries a GST amount, allocation × GST ÷ invoice amount (rounded down).
 * It stays out of the TDS base (CBDT circular 23/2017).
 */
export function gstShareOf(
  allocations: readonly { amount: bigint; invoiceId: string }[],
  invoices: ReadonlyMap<string, { amount: bigint; gstAmount: bigint | null }>,
): bigint {
  let share = 0n;
  for (const allocation of allocations) {
    const invoice = invoices.get(allocation.invoiceId);
    if (invoice?.gstAmount == null || invoice.amount <= 0n) continue;
    share += (allocation.amount * invoice.gstAmount) / invoice.amount;
  }
  return share;
}

export type RecordedTds = {
  section: string | null;
  base: bigint | null;
  /** Percent, two places. */
  rate: string | null;
  amount: bigint;
  suggested: bigint;
  overrideReason: string | null;
};

const RATE_RE = /^\d{1,3}(\.\d{1,2})?$/;

/**
 * What a Contractor payment keeps of its TDS. When the deducted amount is
 * the suggestion, the suggestion's base and rate are kept; otherwise the
 * accountant's base and rate (defaulting to the suggestion's) with a
 * reason (400 `TDS_OVERRIDE_REASON_REQUIRED`).
 */
export function recordedTds(
  suggestion: TdsSuggestion,
  input: {
    amount: bigint;
    base?: bigint | null;
    rate?: string | null;
    overrideReason?: string | null;
  },
): RecordedTds {
  const reason = optionalText(
    input.overrideReason,
    "tdsOverrideReason",
    PARTY_TEXT_LIMITS.reason,
  );
  const section = suggestion.section;
  if (input.amount === suggestion.amount)
    return {
      section,
      base: suggestion.base,
      rate: suggestion.rate,
      amount: input.amount,
      suggested: suggestion.amount,
      overrideReason: null,
    };
  if (reason == null)
    throw new DomainError(
      "TDS_OVERRIDE_REASON_REQUIRED",
      "The TDS differs from the suggestion. Say why.",
      { details: { field: "tdsOverrideReason" } },
    );
  const rate = input.rate?.trim() ?? "";
  if (rate !== "" && (!RATE_RE.test(rate) || Number(rate) > 100))
    throw new DomainError("TDS_RATE_INVALID", "Enter a rate from 0 to 100.", {
      details: { field: "tdsRate" },
    });
  const base = input.base ?? suggestion.base;
  if (base < 0n)
    throw new DomainError("AMOUNT_INVALID", "Enter a base of 0 or more.", {
      details: { field: "tdsBase" },
    });
  return {
    section,
    base,
    rate: rate === "" ? suggestion.rate : Number(rate).toFixed(2),
    amount: input.amount,
    suggested: suggestion.amount,
    overrideReason: reason,
  };
}
