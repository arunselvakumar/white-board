import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * The two finance ledgers (ADR CM-0004, CM-0017 §3, §7). Both are
 * append-only: a change posts entries reversing the old ones
 * (`reversesEntryId`, unique) and new ones. Money is paise as `bigint`.
 */

export type AccountKind = "cash" | "bank" | "petty_cash";

export type PaymentMode = "cash" | "cheque" | "online" | "upi";

/** Cash takes a Cash or Petty Cash account; the rest take a Bank account. */
export function modeFitsAccount(mode: PaymentMode, kind: AccountKind): boolean {
  return mode === "cash" ? kind !== "bank" : kind === "bank";
}

export type CounterpartyKind =
  | "contractor"
  | "supplier"
  | "other_party"
  | "labour"
  | "vendor"
  | "team_member"
  | "client";

export type AccountEntryKind =
  "opening" | "receipt" | "payment" | "transfer_in" | "transfer_out";

export type AccountEntrySource =
  | "account"
  | "transaction"
  | "account_transfer"
  | "petty_cash_voucher"
  | "other_expense"
  | "party_payment"
  | "wage_payment"
  | "salary_slip";

/** What a writer posts to an account (the Ledger Report's columns). */
export type NewAccountEntry = {
  accountId: string;
  projectId: string | null;
  storeId?: string | null;
  entryDate: CalendarDate;
  kind: AccountEntryKind;
  /** Paise, signed: + into the account, − out of it. */
  amount: bigint;
  mode?: PaymentMode | null;
  reference?: string | null;
  paymentCategoryId?: string | null;
  counterpartyKind?: CounterpartyKind | null;
  counterpartyId?: string | null;
  counterpartyName?: string | null;
  documentNumber?: string | null;
  narration?: string | null;
  sourceType: AccountEntrySource;
  sourceId: string;
  reversesEntryId?: string | null;
};

export type AccountEntry = Required<NewAccountEntry> & { id: string };

export type PartyType = "contractor" | "supplier" | "other_party" | "client";

export type PartyEntryKind =
  | "opening"
  | "invoice"
  | "sales_invoice"
  | "payment"
  | "receipt"
  | "tds"
  | "write_off"
  /** Income-tax TDS a Client deducted from a receipt (+, CM-1107). */
  | "client_tds"
  /** GST-TDS (s.51) a Client deducted from a receipt (+, CM-1107). */
  | "gst_tds";

export type PartyEntrySource =
  "party_opening" | "invoice" | "party_payment" | "settlement";

/** What a writer posts to a party's balance. + means the Company owes the party. */
export type NewPartyEntry = {
  partyType: PartyType;
  partyId: string;
  projectId: string | null;
  storeId?: string | null;
  entryDate: CalendarDate;
  kind: PartyEntryKind;
  /** Paise, signed. */
  amount: bigint;
  invoiceId?: string | null;
  sourceType: PartyEntrySource;
  sourceId: string;
  reversesEntryId?: string | null;
};

export type PartyEntry = Required<NewPartyEntry> & { id: string };

/** One amount fits Postgres `bigint` easily; this caps it at ₹100 crore. */
export const MAX_AMOUNT = 100_00_00_000_00n;

export function assertAmount(amount: bigint, field = "amount"): void {
  if (amount <= 0n)
    throw new DomainError("AMOUNT_INVALID", "Enter an amount above zero.", {
      details: { field },
    });
  if (amount > MAX_AMOUNT)
    throw new DomainError(
      "AMOUNT_TOO_LARGE",
      "One amount is at most ₹100 crore.",
      { details: { field } },
    );
}

/** The entry that cancels `entry`, dated the same day. */
export function reversalOf<T extends { id: string; amount: bigint }>(
  entry: T,
): Omit<T, "id"> & { reversesEntryId: string } {
  const { id, ...rest } = entry;
  return { ...rest, amount: -entry.amount, reversesEntryId: id };
}

/** Entries that are neither reversals nor reversed. */
export function liveEntries<
  T extends { id: string; reversesEntryId: string | null },
>(entries: readonly T[]): T[] {
  const reversed = new Set(
    entries.flatMap((entry) =>
      entry.reversesEntryId == null ? [] : [entry.reversesEntryId],
    ),
  );
  return entries.filter(
    (entry) => entry.reversesEntryId == null && !reversed.has(entry.id),
  );
}
