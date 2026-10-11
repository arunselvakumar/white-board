import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import { assertModeReference } from "./accounts";
import { assertAmount, type NewAccountEntry, type PaymentMode } from "./ledger";

/**
 * An Other Expense (ADR CM-0017 §10): a Project's spend with no party bill
 * — a date, a Payment Category, a typed payee, the account it was paid
 * from with its mode and reference, the amount and a description. It is
 * numbered `EXP/26-27/00001` and approved before it moves money (§4).
 * Cheque, Online and UPI keep their number in `reference` (there is no
 * cheque column).
 */

export const PAYEE_NAME_MAX = 120;
export const EXPENSE_REFERENCE_MAX = 100;
export const EXPENSE_DESCRIPTION_MAX = 1000;

export const PAYMENT_MODES = ["cash", "cheque", "online", "upi"] as const;

export type OtherExpenseInput = {
  expenseDate: string;
  paymentCategoryId: string;
  payeeName?: string | null;
  accountId: string;
  mode: PaymentMode;
  reference?: string | null;
  /** Paise. */
  amount: bigint;
  description?: string | null;
};

export type OtherExpenseContent = {
  expenseDate: CalendarDate;
  paymentCategoryId: string;
  payeeName: string | null;
  accountId: string;
  mode: PaymentMode;
  reference: string | null;
  /** Paise, > 0. */
  amount: bigint;
  description: string | null;
};

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

function text(
  raw: string | null | undefined,
  max: number,
  field: string,
  label: string,
): string | null {
  const value = raw?.trim() ?? "";
  if (value.length > max)
    throw invalid(
      "TEXT_TOO_LONG",
      `${label} is at most ${String(max)} characters.`,
      field,
    );
  return value === "" ? null : value;
}

/** Checks and tidies the form (the account itself is checked by the caller). */
export function otherExpenseContent(
  input: OtherExpenseInput,
): OtherExpenseContent {
  let expenseDate: CalendarDate;
  try {
    expenseDate = assertCalendarDate(input.expenseDate.trim());
  } catch {
    throw invalid(
      "EXPENSE_DATE_INVALID",
      "Enter the date of the expense.",
      "expenseDate",
    );
  }
  if (!(PAYMENT_MODES as readonly string[]).includes(input.mode))
    throw invalid(
      "PAYMENT_MODE_INVALID",
      "Choose Cash, Cheque, Online or UPI.",
      "mode",
    );
  assertAmount(input.amount);
  const reference = text(
    input.reference,
    EXPENSE_REFERENCE_MAX,
    "reference",
    "The reference",
  );
  // Cheque keeps its number in `reference` here.
  try {
    assertModeReference(input.mode, { chequeNumber: reference, reference });
  } catch (error) {
    if (error instanceof DomainError)
      throw invalid(error.code, error.message, "reference");
    throw error;
  }
  return {
    expenseDate,
    paymentCategoryId: input.paymentCategoryId,
    payeeName: text(input.payeeName, PAYEE_NAME_MAX, "payeeName", "Paid to"),
    accountId: input.accountId,
    mode: input.mode,
    reference,
    amount: input.amount,
    description: text(
      input.description,
      EXPENSE_DESCRIPTION_MAX,
      "description",
      "The description",
    ),
  };
}

/** The approval state of an expense. */
export type ExpenseApproval = {
  status: "pending" | "approved" | "rejected";
  decidedBy: string | null;
  decidedAt: Date | null;
  rejectReason: string | null;
};

/**
 * The one account entry an approved expense posts (§3, §4): money out of
 * its account, with the columns the Ledger Report filters on.
 */
export function otherExpenseEntry(expense: {
  id: string;
  number: string;
  projectId: string;
  content: OtherExpenseContent;
}): NewAccountEntry {
  const { content } = expense;
  return {
    accountId: content.accountId,
    projectId: expense.projectId,
    entryDate: content.expenseDate,
    kind: "payment",
    amount: -content.amount,
    mode: content.mode,
    reference: content.reference,
    paymentCategoryId: content.paymentCategoryId,
    counterpartyKind: null,
    counterpartyId: null,
    counterpartyName: content.payeeName,
    documentNumber: expense.number,
    narration: content.description ?? "Other Expense",
    sourceType: "other_expense",
    sourceId: expense.id,
  };
}
