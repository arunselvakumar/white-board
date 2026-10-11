import { z } from "zod";

import type { VoucherActions } from "@/src/finance/application/petty-cash-access";
import { MAX_AMOUNT } from "@/src/finance/domain/ledger";
import {
  PETTY_CASH_NAME_MAX,
  PETTY_CASH_TEXT_MAX,
  VOUCHER_TYPES,
} from "@/src/finance/domain/petty-cash";
import type { PettyCashAccountView } from "@/src/finance/infrastructure/petty-cash-accounts";
import type { PettyCashVoucherView } from "@/src/finance/infrastructure/petty-cash-vouchers";
import {
  APPROVAL_LIMITS,
  APPROVAL_STATUSES,
} from "@/src/shared-kernel/approval";

import { COUNTERPARTY_KINDS } from "../lookup-models";

/** `/api/construction/finance/petty-cash` (CM-703). */
export const PETTY_CASH_PATH = "/api/construction/finance/petty-cash";

const paise = z
  .int()
  .describe("Paise (₹1 = 100). Rupees are shown on screen only.");

const amount = z
  .int()
  .positive()
  .max(Number(MAX_AMOUNT))
  .describe(
    "Paise, above zero and at most ₹100 crore (400 AMOUNT_INVALID / AMOUNT_TOO_LARGE).",
  );

const text = z.string().max(5000).nullable().optional();

export const voucherTypeModel = z
  .enum(VOUCHER_TYPES)
  .describe("payment (cash out), receipt (cash in) or transfer.");

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export const ConstructionFinancePettyCashAccountParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionFinancePettyCashAccountResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  holderMemberId: z.uuid(),
  holderName: z.string(),
  isOwn: z.boolean().describe("The caller holds it."),
  openingDate: z.iso.date(),
  balance: paise.describe(
    "Paise: the sum of its approved entries (pending vouchers are not counted). May be negative.",
  ),
  pendingTotal: paise.describe(
    "Paise: what its pending vouchers would add (+) or take (−) once approved.",
  ),
  pendingCount: z.int().nonnegative(),
  lastVoucherDate: z.iso.date().nullable(),
  canClose: z
    .boolean()
    .describe(
      "No vouchers and no entries but the opening: Petty Cash Delete may close it.",
    ),
});
export type ConstructionFinancePettyCashAccountResponseModel = z.infer<
  typeof ConstructionFinancePettyCashAccountResponseModel
>;

export const ListConstructionFinancePettyCashAccountsResponseModel = z.object({
  items: z
    .array(ConstructionFinancePettyCashAccountResponseModel)
    .describe(
      "The caller's own account first, then by holder. Without Petty Cash View all only the caller's own.",
    ),
  viewAll: z
    .boolean()
    .describe("The caller sees every account (Owner or Petty Cash View all)."),
});
export type ListConstructionFinancePettyCashAccountsResponseModel = z.infer<
  typeof ListConstructionFinancePettyCashAccountsResponseModel
>;

export const OpenConstructionFinancePettyCashAccountRequestModel = z.object({
  holderMemberId: z
    .uuid()
    .describe(
      "An active Team Member (400 TEAM_MEMBER_NOT_FOUND) without a live petty-cash account (409 PETTY_CASH_ACCOUNT_EXISTS).",
    ),
  name: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .describe(
      `"Petty cash — <member>" when empty; at most ${String(PETTY_CASH_NAME_MAX)} characters; unique among live accounts in any case (409 ACCOUNT_NAME_TAKEN).`,
    ),
  openingBalance: z
    .int()
    .min(0)
    .max(Number(MAX_AMOUNT))
    .optional()
    .default(0)
    .describe("Paise; posts an opening entry when above zero."),
  openingDate: z.iso
    .date()
    .nullable()
    .optional()
    .describe(
      "The opening entry's date; today by default. 403 FINANCIAL_PERIOD_CLOSED on or before the Financial Closing Date.",
    ),
});
export type OpenConstructionFinancePettyCashAccountRequestModel = z.infer<
  typeof OpenConstructionFinancePettyCashAccountRequestModel
>;

export const ExportConstructionFinancePettyCashReceiptsQueryModel = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine((value) => value.from <= value.to, {
    message: "from is on or before to.",
    path: ["to"],
  });

export function toPettyCashAccountResponse(
  view: PettyCashAccountView,
): ConstructionFinancePettyCashAccountResponseModel {
  return {
    id: view.id,
    name: view.name,
    holderMemberId: view.holderMemberId,
    holderName: view.holderName,
    isOwn: view.isOwn,
    openingDate: view.openingDate,
    balance: Number(view.balance),
    pendingTotal: Number(view.pendingTotal),
    pendingCount: view.pendingCount,
    lastVoucherDate: view.lastVoucherDate,
    canClose: view.canClose,
  };
}

// ---------------------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------------------

export const ConstructionFinancePettyCashVoucherParamsModel = z.object({
  id: z.uuid(),
});

const counterparty = z
  .object({
    kind: z.enum(COUNTERPARTY_KINDS).nullable(),
    id: z.uuid().nullable(),
    name: z.string().max(1000).nullable(),
  })
  .describe(
    "Paid To / Received From: a picked party (`kind` and `id`; its name is read from its record, 400 COUNTERPARTY_NOT_FOUND) or a typed `name` (`kind` null). A label only: it moves no party's balance.",
  );

const voucherFields = {
  voucherType: voucherTypeModel,
  voucherDate: z.iso
    .date()
    .describe(
      "Back-dated module `petty_cash` (403 BACKDATED_CREATE_BLOCKED / BACKDATED_EDIT_BLOCKED / FINANCIAL_PERIOD_CLOSED).",
    ),
  projectId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Optional; Petty Cash rights are checked on it when given (400 PROJECT_NOT_FOUND).",
    ),
  counterparty: counterparty.optional(),
  toAccountId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Transfer only: another live petty-cash or company account (400 TO_ACCOUNT_REQUIRED / TO_ACCOUNT_SAME / TO_ACCOUNT_NOT_FOUND).",
    ),
  paymentCategoryId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Required on a Payment or Receipt (400 PAYMENT_CATEGORY_REQUIRED / NOT_FOUND / DISABLED); ignored on a Transfer.",
    ),
  amount,
  paidFor: text.describe(
    `What the money was for; at most ${String(PETTY_CASH_TEXT_MAX)} characters.`,
  ),
  reference: text.describe("A bill or reference number."),
  description: text,
};

export const CreateConstructionFinancePettyCashVoucherRequestModel = z.object({
  accountId: z
    .uuid()
    .describe(
      "The petty-cash account (400 ACCOUNT_NOT_PETTY_CASH); its holder, or a member with Petty Cash View all, writes on it (403 ACCOUNT_NOT_YOURS).",
    ),
  ...voucherFields,
  approve: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Save & Approve: needs Approve too, and posts the entries at once.",
    ),
});
export type CreateConstructionFinancePettyCashVoucherRequestModel = z.infer<
  typeof CreateConstructionFinancePettyCashVoucherRequestModel
>;

export const UpdateConstructionFinancePettyCashVoucherRequestModel = z.object({
  ...voucherFields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded; a mismatch is 409 PETTY_CASH_VOUCHER_CHANGED.",
    ),
});
export type UpdateConstructionFinancePettyCashVoucherRequestModel = z.infer<
  typeof UpdateConstructionFinancePettyCashVoucherRequestModel
>;

const reason = z
  .string()
  .max(5000)
  .describe(
    `Why it is rejected: required (400 REJECTION_REASON_REQUIRED), at most ${String(APPROVAL_LIMITS.maxTextLength)} characters.`,
  );

export const RejectConstructionFinancePettyCashVoucherRequestModel = z.object({
  reason,
});

const ids = z
  .array(z.uuid())
  .min(1)
  .max(APPROVAL_LIMITS.maxBulk)
  .describe(
    "1–100 vouchers; all or none (409 BULK_DECISION_REFUSED lists each refusal).",
  );

export const BulkApproveConstructionFinancePettyCashVouchersRequestModel =
  z.object({ ids });

export const BulkRejectConstructionFinancePettyCashVouchersRequestModel =
  z.object({ ids, reason });

export const BulkDecideConstructionFinancePettyCashVouchersResponseModel =
  z.object({ decided: z.int().nonnegative() });

export const ListConstructionFinancePettyCashVouchersRequestModel = z
  .object({
    accountId: z
      .uuid()
      .optional()
      .describe("One account; every account the caller sees when left out."),
    projectId: z.uuid().optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    type: voucherTypeModel.optional(),
    status: z.enum(APPROVAL_STATUSES).optional(),
    paymentCategoryId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ConstructionFinancePettyCashVoucherActionsModel = z.object({
  edit: z.boolean(),
  delete: z.boolean(),
  approve: z.boolean(),
  reject: z.boolean(),
});

export const ConstructionFinancePettyCashVoucherResponseModel = z.object({
  id: z.uuid(),
  number: z.string().describe("`PC/26-27/00001`."),
  accountId: z.uuid(),
  accountName: z.string(),
  voucherType: voucherTypeModel,
  voucherDate: z.iso.date(),
  projectId: z.uuid().nullable(),
  projectName: z.string().nullable(),
  counterparty: z.object({
    kind: z.enum(COUNTERPARTY_KINDS).nullable(),
    id: z.uuid().nullable(),
    name: z.string().nullable(),
  }),
  toAccountId: z.uuid().nullable(),
  toAccountName: z.string().nullable(),
  paymentCategoryId: z.uuid().nullable(),
  paymentCategoryName: z.string().nullable(),
  amount: paise,
  paidFor: z.string().nullable(),
  reference: z.string().nullable(),
  description: z.string().nullable(),
  approvalStatus: z.enum(APPROVAL_STATUSES),
  decidedAt: z.iso.datetime().nullable(),
  decidedByName: z.string().nullable(),
  rejectReason: z.string().nullable(),
  fileCount: z.int().nonnegative().describe("Live photos and receipts."),
  createdAt: z.iso.datetime(),
  createdBy: z.string(),
  createdByName: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  actions: ConstructionFinancePettyCashVoucherActionsModel,
});
export type ConstructionFinancePettyCashVoucherResponseModel = z.infer<
  typeof ConstructionFinancePettyCashVoucherResponseModel
>;

export const ListConstructionFinancePettyCashVouchersResponseModel = z.object({
  items: z.array(ConstructionFinancePettyCashVoucherResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  totals: z
    .object({ payment: paise, receipt: paise, transfer: paise })
    .describe("Paise by type, over every voucher the filter matches."),
});
export type ListConstructionFinancePettyCashVouchersResponseModel = z.infer<
  typeof ListConstructionFinancePettyCashVouchersResponseModel
>;

export function toVoucherResponse(
  view: PettyCashVoucherView,
  actions: VoucherActions,
): ConstructionFinancePettyCashVoucherResponseModel {
  return {
    id: view.id,
    number: view.number,
    accountId: view.accountId,
    accountName: view.accountName,
    voucherType: view.voucherType,
    voucherDate: view.voucherDate,
    projectId: view.projectId,
    projectName: view.projectName,
    counterparty: {
      kind: view.counterpartyKind,
      id: view.counterpartyId,
      name: view.counterpartyName,
    },
    toAccountId: view.toAccountId,
    toAccountName: view.toAccountName,
    paymentCategoryId: view.paymentCategoryId,
    paymentCategoryName: view.paymentCategoryName,
    amount: Number(view.amount),
    paidFor: view.paidFor,
    reference: view.reference,
    description: view.description,
    approvalStatus: view.approvalStatus,
    decidedAt: view.decidedAt?.toISOString() ?? null,
    decidedByName: view.decidedByName,
    rejectReason: view.rejectReason,
    fileCount: view.fileCount,
    createdAt: view.createdAt.toISOString(),
    createdBy: view.createdBy,
    createdByName: view.createdByName,
    updatedAt: view.updatedAt.toISOString(),
    actions,
  };
}
