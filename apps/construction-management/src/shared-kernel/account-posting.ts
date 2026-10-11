import type { Prisma } from "@repo/construction-db";

import type { CalendarDate } from "./calendar-date";

/**
 * How labour and HRMS put their payments on finance's account ledger (ADR
 * CM-0017 §12) without importing finance: a port they call inside their
 * own transaction, implemented in `src/composition/account-posting.ts`.
 * Errors are `DomainError`s the caller lets through:
 * `ACCOUNT_NOT_FOUND`, `ACCOUNT_NOT_YOURS`, `ACCOUNT_MODE_MISMATCH`.
 */
export type AccountPosting = {
  /**
   * Checks the account (live in the Company, usable by the actor, fitting
   * the mode), locks it `FOR SHARE`, and posts one entry of money out.
   */
  postPayment(
    tx: Prisma.TransactionClient,
    input: AccountPaymentPosting,
  ): Promise<void>;
  /** Reverses every live entry the source wrote. */
  reverse(
    tx: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      by: string;
      sourceType: AccountPostingSource;
      sourceId: string;
    },
  ): Promise<void>;
  /** Account names by id, deleted accounts included (names on old payments). */
  names(
    db: Prisma.TransactionClient,
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
};

/**
 * Posts nothing and knows no names: for unit tests and factories that do
 * not care about the account ledger (like `NOT_PAID` in procurement). The
 * routes pass the real `accountPosting` from `src/composition`.
 */
export const NO_ACCOUNT_POSTING: AccountPosting = {
  postPayment: () => Promise.resolve(),
  reverse: () => Promise.resolve(),
  names: () => Promise.resolve(new Map()),
};

export type AccountPostingSource = "wage_payment" | "salary_slip";

export type AccountPaymentPosting = {
  workspaceId: string;
  /** User id, written as `created_by`. */
  by: string;
  actor: { userId: string; anyPettyCash: boolean };
  accountId: string;
  /** Labour and HRMS record Cash or Bank; Bank is checked as a bank account. */
  mode: "cash" | "bank";
  projectId: string | null;
  entryDate: CalendarDate;
  /** Paise, positive: the money that left the account. */
  amount: bigint;
  reference: string | null;
  counterparty: {
    kind: "labour" | "vendor" | "team_member";
    id: string;
    name: string;
  };
  narration: string | null;
  sourceType: AccountPostingSource;
  sourceId: string;
};
