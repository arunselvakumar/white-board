import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { panHolderType } from "@/src/shared-kernel/tax-ids";

/** Payee kinds of the TDS rate table (ADR CM-0017 §8). */
export type TdsPayeeKind = "individual_huf" | "other" | "no_pan";

/** One row of `statutory_tds_rates`. Money is paise. */
export type TdsRate = {
  section: string;
  /** What to print: `194C`, or `393 (194C)` from 1 April 2026. */
  label: string;
  payeeKind: TdsPayeeKind;
  /** Percent as a decimal string, e.g. `"1.00"`. */
  rate: string;
  singleThreshold: bigint;
  aggregateThreshold: bigint;
  effectiveFrom: CalendarDate;
};

/**
 * P (individual) and H (HUF) in the PAN's fourth letter pay the lower
 * rate; every other holder the higher; no PAN (or one we cannot read) is
 * section 206AA.
 */
export function payeeKindOf(pan: string | null | undefined): TdsPayeeKind {
  if (pan == null || pan.trim() === "") return "no_pan";
  const holder = panHolderType(pan);
  if (holder == null) return "no_pan";
  return holder === "individual" || holder === "huf"
    ? "individual_huf"
    : "other";
}

/** The row in force on `date`: the latest `effectiveFrom` on or before it. */
export function rateInForce(
  rows: readonly TdsRate[],
  section: string,
  payeeKind: TdsPayeeKind,
  date: CalendarDate,
): TdsRate | null {
  let found: TdsRate | null = null;
  for (const row of rows) {
    if (row.section !== section || row.payeeKind !== payeeKind) continue;
    if (row.effectiveFrom > date) continue;
    if (found == null || row.effectiveFrom > found.effectiveFrom) found = row;
  }
  return found;
}

export type TdsSuggestionInput = {
  /** The Contractor's TDS settings (masters). */
  applicable: boolean;
  /** A lower-deduction certificate's rate (section 197), percent. */
  lowerRate: string | null;
  /** The row in force for the payee kind on the payment date. */
  rate: TdsRate;
  /** This payment's settled amount: money paid + TDS. */
  settled: bigint;
  /** The GST share of `settled` (left out of the base, CBDT circular 23/2017). */
  gstShare: bigint;
  /**
   * The Contractor's settled amounts on earlier live payments in the same
   * financial year, across Projects (paid + TDS).
   */
  priorSettledInYear: bigint;
  /**
   * The bases of those earlier payments on which no TDS was deducted; the
   * payment that first crosses the aggregate threshold catches them up.
   */
  priorUndeductedBaseInYear: bigint;
};

export type TdsSuggestion = {
  section: string;
  label: string;
  /** Percent as a decimal string. */
  rate: string;
  /** Paise: this payment's base plus any catch-up base. */
  base: bigint;
  /** Paise, rounded to the rupee. */
  amount: bigint;
  /** Why: `not_applicable`, `below_threshold`, `single`, `aggregate`, `aggregate_crossed` (with catch-up). */
  reason:
    | "not_applicable"
    | "below_threshold"
    | "single"
    | "aggregate"
    | "aggregate_crossed";
  /** Paise of earlier undeducted base included in `base`. */
  catchUpBase: bigint;
};

/** Percent string → basis points (hundredths of a percent). */
function basisPoints(rate: string): bigint {
  const match = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(rate.trim());
  if (match == null) throw new RangeError(`Not a percent: ${rate}`);
  return (
    BigInt(match[1] ?? "0") * 100n + BigInt((match[2] ?? "").padEnd(2, "0"))
  );
}

/** `base × rate%`, rounded half up to the whole rupee (100 paise). */
export function tdsOn(base: bigint, rate: string): bigint {
  if (base <= 0n) return 0n;
  const paise = base * basisPoints(rate); // paise × bp; ÷ 10,000 for paise
  const rupees = (paise + 500_000n) / 1_000_000n; // ÷ 10,000 ÷ 100, half up
  return rupees * 100n;
}

/**
 * Suggests TDS on a payment to a Contractor (ADR CM-0017 §8):
 * - nothing when TDS does not apply to the Contractor;
 * - the payment's base × rate when its settled amount is above the single
 *   threshold, or when the year's settled total is already above the
 *   aggregate threshold;
 * - on the payment that first takes the year's total above the aggregate
 *   threshold, also the earlier undeducted bases (catch-up);
 * - nothing otherwise.
 * The rate is the certificate's when one is set, else the table's.
 */
export function suggestTds(input: TdsSuggestionInput): TdsSuggestion {
  const rate = input.lowerRate ?? input.rate.rate;
  const ownBase =
    input.settled - input.gstShare > 0n ? input.settled - input.gstShare : 0n;
  const none = (reason: TdsSuggestion["reason"]): TdsSuggestion => ({
    section: input.rate.section,
    label: input.rate.label,
    rate,
    base: 0n,
    amount: 0n,
    reason,
    catchUpBase: 0n,
  });
  if (!input.applicable || input.settled <= 0n) return none("not_applicable");

  const before = input.priorSettledInYear;
  const after = before + input.settled;
  const aggregate = input.rate.aggregateThreshold;

  let reason: TdsSuggestion["reason"];
  let catchUpBase = 0n;
  if (before > aggregate) reason = "aggregate";
  else if (after > aggregate) {
    reason = "aggregate_crossed";
    catchUpBase = input.priorUndeductedBaseInYear;
  } else if (input.settled > input.rate.singleThreshold) reason = "single";
  else return none("below_threshold");

  const base = ownBase + catchUpBase;
  let amount = tdsOn(base, rate);
  // TDS can never exceed what this payment settles.
  if (amount > input.settled) amount = input.settled;
  return {
    section: input.rate.section,
    label: input.rate.label,
    rate,
    base,
    amount,
    reason,
    catchUpBase,
  };
}
