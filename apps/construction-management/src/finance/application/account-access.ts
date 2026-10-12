import { can, type MemberAccess } from "@/src/shared-kernel/access";
import {
  addDays,
  daysBetween,
  isCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import type { AccountKind } from "../domain/ledger";

/**
 * Who may read an account's statement (its ledger): the Owner always; a
 * company account with Company's Bank A/C read or Transactions read (on
 * any Project); a petty-cash account by its holder, or with Petty Cash
 * View all. Petty Cash's statement screen (CM-703) uses the same rule.
 */
export function canReadAccountStatement(
  access: MemberAccess,
  account: { kind: AccountKind; holderUserId: string | null },
): boolean {
  if (access.role === "owner") return true;
  if (account.kind === "petty_cash")
    return (
      (account.holderUserId != null &&
        account.holderUserId === access.userId) ||
      can(access, "finance.petty_cash", "view_all")
    );
  return (
    can(access, "masters.bank_accounts", "read") ||
    can(access, "finance.transactions", "read")
  );
}

/** A statement covers at most this many days. */
export const STATEMENT_MAX_DAYS = 366;

/**
 * The statement's period: both ends given, or this month (the 1st to
 * today) by default; `from` ≤ `to`, at most 366 days.
 */
export function statementPeriod(
  input: { from?: string | null; to?: string | null },
  today: CalendarDate,
): { from: CalendarDate; to: CalendarDate } {
  const to = input.to ?? today;
  const from = input.from ?? `${to.slice(0, 7)}-01`;
  if (!isCalendarDate(from) || !isCalendarDate(to))
    throw new DomainError("DATE_INVALID", "Enter the dates as YYYY-MM-DD.", {
      details: { field: "from" },
    });
  if (from > to)
    throw new DomainError(
      "PERIOD_INVALID",
      "The start date is after the end date.",
      { details: { field: "from" } },
    );
  if (daysBetween(from, to) >= STATEMENT_MAX_DAYS)
    throw new DomainError(
      "PERIOD_TOO_LONG",
      `A statement covers at most ${String(STATEMENT_MAX_DAYS)} days. The earliest start for this end is ${addDays(to, -(STATEMENT_MAX_DAYS - 1))}.`,
      { details: { field: "from" } },
    );
  return { from, to };
}
