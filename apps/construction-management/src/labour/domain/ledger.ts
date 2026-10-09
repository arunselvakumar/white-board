import {
  addDays,
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { weekdayOf } from "./wages";

/** ADR CM-0004. Positive amounts are owed to the party. */
export type LedgerEntryKind =
  "opening" | "earned" | "overtime" | "payment" | "advance";

export type PartyType = "labour" | "vendor";

export type LedgerEntry = {
  id: string;
  kind: LedgerEntryKind;
  /** Paise, signed. */
  amount: number;
  entryDate: CalendarDate;
  projectId: string | null;
  reversesEntryId: string | null;
};

/** What a command asks the ledger to append. */
export type NewLedgerEntry = {
  partyType: PartyType;
  partyId: string;
  projectId: string | null;
  entryDate: CalendarDate;
  kind: LedgerEntryKind;
  amount: number;
  sourceType: LedgerSourceType;
  sourceId: string;
  reversesEntryId: string | null;
};

/**
 * The most one amount (an entry, a payment, a day's pay) can be: a Postgres
 * `integer` of paise, about ₹21.47 crore. Sums of amounts are bigint.
 */
export const MAX_AMOUNT_PAISE = 2_147_483_647;

/** Refuses an amount that does not fit one `integer` column. */
export function assertAmountFits(amount: number, message: string): void {
  if (Math.abs(amount) > MAX_AMOUNT_PAISE)
    throw new DomainError("AMOUNT_TOO_LARGE", message, {
      details: { amount, max: MAX_AMOUNT_PAISE },
    });
}

export type LedgerSourceType =
  | "labour"
  | "vendor"
  | "labour_attendance"
  | "vendor_attendance"
  | "wage_payment";

/** The entry that cancels `entry`: same kind and date, opposite amount. */
export function reversalOf(
  entry: LedgerEntry & {
    partyType: PartyType;
    partyId: string;
    sourceType: LedgerSourceType;
    sourceId: string;
  },
): NewLedgerEntry {
  if (entry.reversesEntryId != null)
    throw new DomainError(
      "LEDGER_REVERSAL_OF_REVERSAL",
      "A reversal is never reversed; post a new entry instead.",
      { kind: "conflict" },
    );
  return {
    partyType: entry.partyType,
    partyId: entry.partyId,
    projectId: entry.projectId,
    entryDate: entry.entryDate,
    kind: entry.kind,
    amount: -entry.amount,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    reversesEntryId: entry.id,
  };
}

/**
 * The entries of a source that still count: those neither reversed nor
 * reversals. A command reverses exactly these before posting new ones.
 */
export function liveEntries<T extends LedgerEntry>(entries: readonly T[]): T[] {
  const reversed = new Set(
    entries
      .map((entry) => entry.reversesEntryId)
      .filter((id): id is string => id != null),
  );
  return entries.filter(
    (entry) => entry.reversesEntryId == null && !reversed.has(entry.id),
  );
}

export type Period = { from: CalendarDate; to: CalendarDate };

export type PeriodKind = "monthly" | "weekly" | "custom";

/** The calendar month containing `date`. */
export function monthOf(date: CalendarDate): Period {
  const [year = 0, month = 0] = assertCalendarDate(date).split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  return { from: `${prefix}-01`, to: `${prefix}-${String(last)}` };
}

/** Monday to Sunday around `date`. */
export function weekOf(date: CalendarDate): Period {
  const weekday = weekdayOf(date);
  const back = weekday === 0 ? 6 : weekday - 1;
  const from = addDays(date, -back);
  return { from, to: addDays(from, 6) };
}

export function period(
  kind: PeriodKind,
  anchor: CalendarDate,
  to?: CalendarDate,
): Period {
  switch (kind) {
    case "monthly":
      return monthOf(anchor);
    case "weekly":
      return weekOf(anchor);
    case "custom": {
      const end = assertCalendarDate(to ?? anchor);
      if (end < assertCalendarDate(anchor))
        throw new DomainError(
          "PERIOD_INVALID",
          "The period must end on or after the day it starts.",
        );
      return { from: anchor, to: end };
    }
  }
}

/**
 * The legacy labour payment figures for a period (ADR CM-0004):
 * Previous Balance, To Pay, Advance, Paid, Final Amount. All paise.
 */
export type PeriodSummary = Period & {
  /** Owed before the period, including any opening balance up to its end. */
  previousBalance: number;
  earned: number;
  overtime: number;
  /** earned + overtime. */
  toPay: number;
  /** Advances paid in the period, as a positive amount. */
  advance: number;
  /** Payments made in the period, as a positive amount. */
  paid: number;
  /** previousBalance + toPay − advance − paid = balance at the period's end. */
  finalAmount: number;
};

export function summarize(
  entries: readonly Pick<LedgerEntry, "kind" | "amount" | "entryDate">[],
  { from, to }: Period,
): PeriodSummary {
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
    from,
    to,
    previousBalance,
    earned,
    overtime,
    toPay,
    advance,
    paid,
    finalAmount: previousBalance + toPay - advance - paid,
  };
}

/** What is owed to the party at the end of `date`. */
export function balanceOn(
  entries: readonly Pick<LedgerEntry, "amount" | "entryDate">[],
  date: CalendarDate,
): number {
  return entries.reduce(
    (sum, entry) => (entry.entryDate <= date ? sum + entry.amount : sum),
    0,
  );
}
