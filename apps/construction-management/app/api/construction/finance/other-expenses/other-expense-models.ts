import { z } from "zod";

import type {
  OtherExpenseActions,
  OtherExpenseReadModel,
  OtherExpenseTotals,
} from "@/src/finance/application/other-expense-handlers";
import { APPROVAL_LIMITS } from "@/src/shared-kernel/approval";

export const OTHER_EXPENSES_PATH = "/api/construction/finance/other-expenses";

const mode = z.enum(["cash", "cheque", "online", "upi"]);
const status = z.enum(["pending", "approved", "rejected"]);

const fields = {
  /** `YYYY-MM-DD`, not after today; under the `other_expense` back-dated limits. */
  expenseDate: z.iso.date(),
  paymentCategoryId: z
    .uuid()
    .describe(
      "A live, enabled Payment Category (400 PAYMENT_CATEGORY_NOT_FOUND).",
    ),
  payeeName: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .describe("Paid to: a typed name, at most 120 characters."),
  accountId: z
    .uuid()
    .describe(
      "The account it was paid from: Cash → a Cash or petty-cash account, Cheque / Online / UPI → a Bank account (400 ACCOUNT_MODE_MISMATCH, 403 ACCOUNT_NOT_YOURS, 404 ACCOUNT_NOT_FOUND).",
    ),
  mode,
  reference: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .describe(
      "The cheque number for Cheque (400 CHEQUE_NUMBER_REQUIRED), the transaction reference for Online / UPI (400 REFERENCE_REQUIRED); at most 100 characters.",
    ),
  /** Paise, > 0 and at most ₹100 crore. */
  amount: z.int(),
  description: z.string().max(5000).nullable().optional(),
  approve: z
    .boolean()
    .optional()
    .describe(
      "Save & Approve: needs Approve; posts the account entry at once.",
    ),
};

export const CreateConstructionFinanceOtherExpenseRequestModel = z.object({
  projectId: z.uuid(),
  ...fields,
});
export type CreateConstructionFinanceOtherExpenseRequestModel = z.input<
  typeof CreateConstructionFinanceOtherExpenseRequestModel
>;

export const UpdateConstructionFinanceOtherExpenseRequestModel = z.object({
  ...fields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe("The `updatedAt` you loaded (409 OTHER_EXPENSE_CHANGED)."),
});
export type UpdateConstructionFinanceOtherExpenseRequestModel = z.input<
  typeof UpdateConstructionFinanceOtherExpenseRequestModel
>;

const optionalVersion = z.iso
  .datetime()
  .nullable()
  .optional()
  .describe("When sent, 409 OTHER_EXPENSE_CHANGED if someone saved since.");

export const DeleteConstructionFinanceOtherExpenseRequestModel = z.object({
  expectedUpdatedAt: optionalVersion,
});

export const ApproveConstructionFinanceOtherExpenseRequestModel = z.object({
  expectedUpdatedAt: optionalVersion,
});

export const RejectConstructionFinanceOtherExpenseRequestModel = z.object({
  reason: z
    .string()
    .max(2000)
    .describe(
      "Required, at most 500 characters (400 REJECTION_REASON_REQUIRED).",
    ),
  expectedUpdatedAt: optionalVersion,
});

export const BulkApproveConstructionFinanceOtherExpensesRequestModel = z.object(
  {
    projectId: z.uuid(),
    ids: z.array(z.uuid()).min(1).max(APPROVAL_LIMITS.maxBulk),
  },
);

export const BulkRejectConstructionFinanceOtherExpensesRequestModel =
  BulkApproveConstructionFinanceOtherExpensesRequestModel.extend({
    reason: z.string().max(2000),
  });

export const BulkDecideConstructionFinanceOtherExpensesResponseModel = z.object(
  { decided: z.int().nonnegative() },
);
export type BulkDecideConstructionFinanceOtherExpensesResponseModel = z.infer<
  typeof BulkDecideConstructionFinanceOtherExpensesResponseModel
>;

export const ConstructionFinanceOtherExpenseParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionFinanceOtherExpensesRequestModel = z
  .object({
    projectId: z.uuid(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    paymentCategoryId: z.uuid().optional(),
    accountId: z.uuid().optional(),
    status: status.optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

const ref = z.object({ id: z.uuid(), name: z.string() });

export const ConstructionFinanceOtherExpenseResponseModel = z.object({
  id: z.uuid(),
  /** `EXP/26-27/00001`. */
  number: z.string(),
  projectId: z.uuid(),
  projectName: z.string().nullable(),
  expenseDate: z.iso.date(),
  paymentCategory: ref,
  payeeName: z.string().nullable(),
  account: z.object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(["cash", "bank", "petty_cash"]),
  }),
  mode,
  reference: z.string().nullable(),
  /** Paise. */
  amount: z.int(),
  description: z.string().nullable(),
  status,
  decidedBy: ref.nullable(),
  decidedAt: z.iso.datetime().nullable(),
  rejectReason: z.string().nullable(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.iso.datetime(),
  /** Send back as `expectedUpdatedAt`. */
  updatedAt: z.iso.datetime(),
  actions: z
    .object({
      edit: z.boolean(),
      delete: z.boolean(),
      approve: z.boolean(),
      reject: z.boolean(),
    })
    .describe("What the caller may do; the routes check again."),
});
export type ConstructionFinanceOtherExpenseResponseModel = z.infer<
  typeof ConstructionFinanceOtherExpenseResponseModel
>;

export const ListConstructionFinanceOtherExpensesResponseModel = z.object({
  items: z.array(ConstructionFinanceOtherExpenseResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  totals: z
    .object({
      amount: z.int(),
      approved: z.int(),
      pending: z.int(),
      rejected: z.int(),
    })
    .describe("Paise sums of every expense matching the filters (all pages)."),
});
export type ListConstructionFinanceOtherExpensesResponseModel = z.infer<
  typeof ListConstructionFinanceOtherExpensesResponseModel
>;

export function toOtherExpenseResponse(
  expense: OtherExpenseReadModel,
  actions: OtherExpenseActions,
): ConstructionFinanceOtherExpenseResponseModel {
  return {
    id: expense.id,
    number: expense.number,
    projectId: expense.projectId,
    projectName: expense.projectName,
    expenseDate: expense.expenseDate,
    paymentCategory: expense.paymentCategory,
    payeeName: expense.payeeName,
    account: {
      ...expense.account,
      kind: expense.account.kind as "cash" | "bank" | "petty_cash",
    },
    mode: expense.mode,
    reference: expense.reference,
    amount: expense.amount,
    description: expense.description,
    status: expense.status,
    decidedBy: expense.decidedBy,
    decidedAt: expense.decidedAt?.toISOString() ?? null,
    rejectReason: expense.rejectReason,
    createdBy: expense.createdBy,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
    actions,
  };
}

export function toTotalsResponse(totals: OtherExpenseTotals) {
  return {
    amount: Number(totals.amount),
    approved: Number(totals.approved),
    pending: Number(totals.pending),
    rejected: Number(totals.rejected),
  };
}
