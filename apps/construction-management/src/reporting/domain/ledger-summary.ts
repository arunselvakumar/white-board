import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { DateRange } from "./report-period";

/**
 * A labour ledger entry as the reports read it (ADR CM-0004): signed paise,
 * positive owed to the party. A reversal keeps its original's kind and
 * date with the opposite amount, so sums by kind net it out.
 */
export type ReportLedgerEntry = {
  partyId: string;
  kind: "opening" | "earned" | "overtime" | "payment" | "advance";
  amount: number;
  entryDate: CalendarDate;
};

/** The legacy labour payment figures for a period. All paise. */
export type PaymentFigures = {
  /** Owed before the period, including opening entries up to its end. */
  previousBalance: number;
  earned: number;
  overtime: number;
  /** earned + overtime. */
  toPay: number;
  /** Advances paid in the period, positive. */
  advance: number;
  /** Payments made in the period, positive. */
  paid: number;
  /** previousBalance + toPay − advance − paid: the balance at the end. */
  finalAmount: number;
};

/**
 * ADR CM-0004's mapping, as the labour context's `summarize`: Previous
 * Balance = every entry before the period plus opening entries up to its
 * end; To Pay = earned + overtime in the period; Advance and Paid =
 * advances and payments in the period; Final Amount = the closing balance.
 * Entries after the period are ignored.
 */
export function paymentFigures(
  entries: readonly Pick<ReportLedgerEntry, "kind" | "amount" | "entryDate">[],
  { from, to }: DateRange,
): PaymentFigures {
  let previousBalance = 0;
  let earned = 0;
  let overtime = 0;
  let advance = 0;
  let paid = 0;
  for (const entry of entries) {
    if (entry.entryDate > to) continue;
    if (entry.entryDate < from || entry.kind === "opening") {
      previousBalance += entry.amount;
      continue;
    }
    switch (entry.kind) {
      case "earned":
        earned += entry.amount;
        break;
      case "overtime":
        overtime += entry.amount;
        break;
      case "advance":
        advance -= entry.amount;
        break;
      case "payment":
        paid -= entry.amount;
        break;
    }
  }
  const toPay = earned + overtime;
  return {
    previousBalance,
    earned,
    overtime,
    toPay,
    advance,
    paid,
    finalAmount: previousBalance + toPay - advance - paid,
  };
}
