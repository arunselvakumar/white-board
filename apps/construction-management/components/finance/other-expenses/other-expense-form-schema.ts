import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import type {
  OtherExpense,
  OtherExpenseInput,
} from "@/src/queries/finance-other-expenses";

export const EXPENSE_MODES = ["cash", "cheque", "online", "upi"] as const;
export type ExpenseMode = (typeof EXPENSE_MODES)[number];

/** Client checks; the server repeats every rule (CM-704). */
export const otherExpenseFormSchema = z
  .object({
    expenseDate: z.string().min(1, "Enter the date of the expense"),
    paymentCategoryId: z.string().min(1, "Choose the Payment Category"),
    payeeName: z.string().trim().max(120, "Use at most 120 characters"),
    mode: z.enum(EXPENSE_MODES),
    accountId: z.string().min(1, "Choose the account it was paid from"),
    reference: z.string().trim().max(100, "Use at most 100 characters"),
    /** Rupees as typed. */
    amount: z.string(),
    description: z.string().trim().max(1000, "Use at most 1000 characters"),
    files: z.array(z.custom<File>()),
  })
  .superRefine((values, ctx) => {
    const paise = rupeesToPaise(values.amount);
    if (!isRupees(values.amount) || paise == null || paise <= 0)
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter an amount more than zero",
      });
    if (values.mode === "cheque" && values.reference.trim() === "")
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: "Enter the cheque number",
      });
    if (
      (values.mode === "online" || values.mode === "upi") &&
      values.reference.trim() === ""
    )
      ctx.addIssue({
        code: "custom",
        path: ["reference"],
        message: "Enter the transaction reference",
      });
  });

export type OtherExpenseFormValues = z.infer<typeof otherExpenseFormSchema>;

export function otherExpenseFormDefaults(
  expense: OtherExpense | null,
  today: string,
): OtherExpenseFormValues {
  return {
    expenseDate: expense?.expenseDate ?? today,
    paymentCategoryId: expense?.paymentCategory.id ?? "",
    payeeName: expense?.payeeName ?? "",
    mode: expense?.mode ?? "cash",
    // A new form takes the account picker's default for the mode.
    accountId: expense?.account.id ?? "",
    reference: expense?.reference ?? "",
    amount: expense == null ? "" : paiseToRupees(expense.amount),
    description: expense?.description ?? "",
    files: [],
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function otherExpensePayload(
  values: OtherExpenseFormValues,
  approve: boolean,
): Omit<OtherExpenseInput, "projectId"> {
  return {
    expenseDate: values.expenseDate,
    paymentCategoryId: values.paymentCategoryId,
    payeeName: orNull(values.payeeName),
    accountId: values.accountId,
    mode: values.mode,
    reference: orNull(values.reference),
    amount: rupeesToPaise(values.amount) ?? 0,
    description: orNull(values.description),
    ...(approve ? { approve: true } : {}),
  };
}

/** Server refusals shown under their field. */
export const EXPENSE_FIELD_BY_CODE = {
  EXPENSE_DATE_INVALID: "expenseDate",
  EXPENSE_DATE_IN_FUTURE: "expenseDate",
  BACKDATED_CREATE_BLOCKED: "expenseDate",
  BACKDATED_EDIT_BLOCKED: "expenseDate",
  FINANCIAL_PERIOD_CLOSED: "expenseDate",
  PAYMENT_CATEGORY_NOT_FOUND: "paymentCategoryId",
  ACCOUNT_NOT_FOUND: "accountId",
  ACCOUNT_NOT_YOURS: "accountId",
  ACCOUNT_MODE_MISMATCH: "accountId",
  CHEQUE_NUMBER_REQUIRED: "reference",
  REFERENCE_REQUIRED: "reference",
  AMOUNT_INVALID: "amount",
  AMOUNT_TOO_LARGE: "amount",
} as const;
