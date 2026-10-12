import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

/**
 * Payment In & Out & Balance on the Project Dashboard (CM-709, ADR CM-0017
 * §16): money into and out of accounts on a Project, by month. Money is
 * paise as `bigint`.
 */

export type MonthFlow = {
  /** `YYYY-MM`. */
  month: string;
  /** Money in, net of reversed receipts. */
  in: bigint;
  /** Money out (positive), net of reversed payments. */
  out: bigint;
  /** in − out. */
  net: bigint;
  /** Every in − out on the Project up to the month's end. */
  balance: bigint;
};

/** Every month from `from`'s to `to`'s, as `YYYY-MM`. */
export function monthsBetween(from: CalendarDate, to: CalendarDate): string[] {
  const months: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const lastYear = Number(to.slice(0, 4));
  const lastMonth = Number(to.slice(5, 7));
  while (year < lastYear || (year === lastYear && month <= lastMonth)) {
    months.push(`${String(year)}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * Fills every month of the duration (months without money are zero) and
 * runs the balance from what came before the duration.
 */
export function monthlyFlows(
  months: readonly string[],
  sums: readonly { month: string; in: bigint; out: bigint }[],
  before: bigint,
): MonthFlow[] {
  const byMonth = new Map(sums.map((row) => [row.month, row]));
  let balance = before;
  return months.map((month) => {
    const row = byMonth.get(month);
    const into = row?.in ?? 0n;
    const out = row?.out ?? 0n;
    balance += into - out;
    return { month, in: into, out, net: into - out, balance };
  });
}

/** Where a Project's money went (Module Wise Payment). */
export const PAYMENT_MODULES = [
  "contractor",
  "supplier",
  "labour",
  "vendor",
  "other_party",
  "other_expense",
] as const;

export type PaymentModule = (typeof PAYMENT_MODULES)[number];
