import { DomainError, notFound } from "@/src/shared-kernel/domain-error";

import { modeFitsAccount, type AccountKind, type PaymentMode } from "./ledger";

/** IFSC: four letters, a zero, six letters or digits. */
export function isIfsc(value: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value);
}

/** What a money form needs to know about the account it names. */
export type AccountFacts = {
  id: string;
  kind: AccountKind;
  name: string;
  /** Petty cash only. */
  holderMemberId: string | null;
  /** Petty cash only: the holder's user, to know "my own account". */
  holderUserId: string | null;
};

/**
 * Who is paying: the signed-in user, and whether they may use every
 * petty-cash account (Owner, or Petty Cash View all).
 */
export type AccountActor = {
  userId: string;
  anyPettyCash: boolean;
};

/**
 * May `actor` move money through `account` with `mode` (ADR CM-0017 §2,
 * §5)? A company account: anyone the form's menu lets in. A petty-cash
 * account: its holder, or a member with Petty Cash View all. The mode must
 * fit the account (Cash → Cash or Petty Cash; Cheque, Online, UPI → Bank).
 */
export function assertAccountUsable(
  account: AccountFacts | null,
  mode: PaymentMode,
  actor: AccountActor,
): asserts account is AccountFacts {
  if (account == null)
    throw notFound("ACCOUNT_NOT_FOUND", "That account no longer exists.");
  if (
    account.kind === "petty_cash" &&
    !actor.anyPettyCash &&
    account.holderUserId !== actor.userId
  )
    throw new DomainError(
      "ACCOUNT_NOT_YOURS",
      "You can only use your own petty-cash account.",
      { kind: "forbidden", details: { field: "accountId" } },
    );
  if (!modeFitsAccount(mode, account.kind))
    throw new DomainError(
      "ACCOUNT_MODE_MISMATCH",
      mode === "cash"
        ? "Cash is paid from a Cash or petty-cash account."
        : "Cheque, Online and UPI go through a Bank account.",
      { details: { field: "accountId" } },
    );
}

/** Cheque needs a cheque number; Online and UPI need a reference. */
export function assertModeReference(
  mode: PaymentMode,
  input: { chequeNumber?: string | null; reference?: string | null },
): void {
  if (mode === "cheque" && !input.chequeNumber?.trim())
    throw new DomainError(
      "CHEQUE_NUMBER_REQUIRED",
      "Enter the cheque number.",
      {
        details: { field: "chequeNumber" },
      },
    );
  if ((mode === "online" || mode === "upi") && !input.reference?.trim())
    throw new DomainError(
      "REFERENCE_REQUIRED",
      "Enter the transaction reference.",
      { details: { field: "reference" } },
    );
}
