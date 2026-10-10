import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { lastDayOf, monthNumber, type MonthKey } from "./calendar";

/**
 * Statutory payroll figures as effective-dated rows (ADR CM-0008). Rates
 * are decimal strings ("12.00") so no float touches them; money is paise.
 * The row in force for a salary month is the latest `effectiveFrom` on or
 * before the month's last day. These functions are the one rule; the
 * Prisma and in-memory `StatutoryRates` both use them.
 */

export type PfRate = {
  effectiveFrom: CalendarDate;
  /** Paise a month. */
  wageCeiling: number;
  employeePercent: string;
  /** Total employer share, EPS included. */
  employerPercent: string;
  /** The EPS part of the employer share, on wage up to the ceiling. */
  epsPercent: string;
  source: string;
};

export type EsiRate = {
  effectiveFrom: CalendarDate;
  /** Paise a month of gross. */
  wageCeiling: number;
  pwdWageCeiling: number;
  employeePercent: string;
  employerPercent: string;
  source: string;
};

/** Who a PT slab applies to; most states use `everyone`. */
export type PtAppliesTo = "everyone" | "men" | "women";

export type PtSlab = {
  /** GST state code (`shared-kernel/gst-states`). */
  stateCode: string;
  effectiveFrom: CalendarDate;
  appliesTo: PtAppliesTo;
  /** Paise of monthly gross, inclusive. */
  grossFrom: number;
  /** Paise, inclusive; null = no upper bound. */
  grossTo: number | null;
  /** Paise a month. */
  monthlyAmount: number;
  /** A month (1–12) charged `specialMonthAmount` instead, e.g. February. */
  specialMonth: number | null;
  specialMonthAmount: number | null;
  source: string;
};

/** As recorded on the member's salary configuration; null = not recorded. */
export type PtGender = "male" | "female" | "other" | null;

/** The PT a month's gross pays, with the slab used (null when none applies). */
export type PtCharge = { amount: number; slab: PtSlab | null };

/** The row in force for `month`, or null before the first one. */
export function rateInForce<Row extends { effectiveFrom: CalendarDate }>(
  rows: readonly Row[],
  month: MonthKey,
): Row | null {
  const end = lastDayOf(month);
  let found: Row | null = null;
  for (const row of rows)
    if (
      row.effectiveFrom <= end &&
      (found == null || row.effectiveFrom > found.effectiveFrom)
    )
      found = row;
  return found;
}

/**
 * Which slab rows can apply to a gender. A member with no recorded gender
 * (or `other`) is charged on the men's rows where a state splits them:
 * those are the Act's general slab, and the women's rows are an exemption
 * that needs the gender on record.
 */
function appliesTo(slab: PtSlab, gender: PtGender): boolean {
  if (slab.appliesTo === "everyone") return true;
  if (gender === "female") return slab.appliesTo === "women";
  return slab.appliesTo === "men";
}

/**
 * Professional tax for one member's month (ADR CM-0008): the state's slabs
 * with the latest `effectiveFrom` on or before the month's last day, the
 * one whose range holds `gross`, and its special-month amount when the
 * month matches. No slab, or no rows for the state, is no PT.
 */
export function ptFor(
  slabs: readonly PtSlab[],
  input: {
    stateCode: string;
    month: MonthKey;
    /** Paise of monthly gross. */
    gross: number;
    gender?: PtGender;
  },
): PtCharge {
  const end = lastDayOf(input.month);
  const state = slabs.filter(
    (slab) => slab.stateCode === input.stateCode && slab.effectiveFrom <= end,
  );
  let latest: CalendarDate | null = null;
  for (const slab of state)
    if (latest == null || slab.effectiveFrom > latest)
      latest = slab.effectiveFrom;
  const gender = input.gender ?? null;
  const slab =
    state.find(
      (row) =>
        row.effectiveFrom === latest &&
        appliesTo(row, gender) &&
        input.gross >= row.grossFrom &&
        (row.grossTo == null || input.gross <= row.grossTo),
    ) ?? null;
  if (slab == null) return { amount: 0, slab: null };
  const special =
    slab.specialMonth != null &&
    slab.specialMonthAmount != null &&
    slab.specialMonth === monthNumber(input.month);
  return {
    amount: special ? (slab.specialMonthAmount ?? 0) : slab.monthlyAmount,
    slab,
  };
}
