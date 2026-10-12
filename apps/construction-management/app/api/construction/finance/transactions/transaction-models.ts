import { z } from "zod";

import { COUNTERPARTY_KINDS } from "../lookup-models";

export const TRANSACTIONS_PATH = "/api/construction/finance/transactions";
export const TRANSFERS_PATH = "/api/construction/finance/transfers";

const paise = z.int();
const mode = z.enum(["cash", "cheque", "online", "upi"]);
const approvalStatus = z.enum(["pending", "approved", "rejected"]);
const accountKind = z.enum(["cash", "bank", "petty_cash"]);
const text = (max: number) => z.string().max(max).nullable().optional();

/** Paid To / Received From: a picked party (`kind` + `id`) or a typed name (`kind` null). */
export const ConstructionFinanceCounterpartyModel = z
  .object({
    kind: z.enum(COUNTERPARTY_KINDS).nullable(),
    id: z.uuid().nullable(),
    name: z.string().max(200),
  })
  .meta({ id: "ConstructionFinanceCounterpartyModel" });

const TransactionBody = z.object({
  /** `YYYY-MM-DD`; the back-dated limits of Transactions apply. */
  transactionDate: z.iso.date(),
  type: z.enum(["payment_in", "payment_out"]),
  /** A company account, or a petty-cash account the caller may use; it must fit the mode. */
  accountId: z.uuid(),
  paymentCategoryId: z.uuid().nullable().optional(),
  mode,
  /** Required for Cheque. */
  chequeNumber: text(60),
  /** Required for Online and UPI. */
  reference: text(60),
  /** Cheque date (Cheque only). */
  modeDate: z.iso.date().nullable().optional(),
  counterparty: ConstructionFinanceCounterpartyModel.nullable().optional(),
  /** Paise, above 0 and at most ₹100 crore. */
  amount: paise,
  description: text(1000),
  /** Save & Approve: needs Approve on Transactions. */
  approve: z.boolean().optional(),
  /** "Save anyway" after 409 `DUPLICATE_REFERENCE`. */
  confirmDuplicateReference: z.boolean().optional(),
});

export const CreateConstructionFinanceTransactionRequestModel =
  TransactionBody.extend({
    /** The Project (needs the flag on it); or a Store; or neither (Company-level). */
    projectId: z.uuid().nullable().optional(),
    storeId: z.uuid().nullable().optional(),
  });

export const UpdateConstructionFinanceTransactionRequestModel =
  TransactionBody.extend({
    /** 409 `TRANSACTION_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

const TransferBody = z.object({
  transferDate: z.iso.date(),
  /** Usable by the caller; the mode must fit it. */
  fromAccountId: z.uuid(),
  /** Any live account other than the from account. */
  toAccountId: z.uuid(),
  mode,
  /** The cheque number (Cheque) or transaction reference (Online, UPI). */
  reference: text(60),
  amount: paise,
  description: text(1000),
  approve: z.boolean().optional(),
  confirmDuplicateReference: z.boolean().optional(),
});

export const CreateConstructionFinanceTransferRequestModel =
  TransferBody.extend({ projectId: z.uuid().nullable().optional() });

export const UpdateConstructionFinanceTransferRequestModel =
  TransferBody.extend({ expectedUpdatedAt: z.iso.datetime() });

export const ConstructionFinanceDocumentParamsModel = z.object({
  id: z.uuid(),
});

/** Approve: optionally guarded by `expectedUpdatedAt`. */
export const ApproveConstructionFinanceTransactionRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime().optional(),
});

export const RejectConstructionFinanceTransactionRequestModel = z.object({
  reason: z.string().max(500),
  expectedUpdatedAt: z.iso.datetime().optional(),
});

export const DeleteConstructionFinanceTransactionRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

const ActionsModel = z
  .object({
    approve: z.boolean(),
    reject: z.boolean(),
    edit: z.boolean(),
    delete: z.boolean(),
  })
  .meta({ id: "ConstructionFinanceTransactionActionsModel" });

export const ConstructionFinanceTransactionResponseModel = z
  .object({
    type: z.literal("transaction"),
    id: z.uuid(),
    number: z.string(),
    projectId: z.uuid().nullable(),
    projectName: z.string().nullable(),
    storeId: z.uuid().nullable(),
    storeName: z.string().nullable(),
    transactionDate: z.iso.date(),
    direction: z.enum(["payment_in", "payment_out"]),
    account: z.object({
      id: z.uuid(),
      name: z.string().nullable(),
      kind: accountKind.nullable(),
    }),
    paymentCategoryId: z.uuid().nullable(),
    paymentCategoryName: z.string().nullable(),
    mode,
    chequeNumber: z.string().nullable(),
    reference: z.string().nullable(),
    modeDate: z.iso.date().nullable(),
    counterparty: ConstructionFinanceCounterpartyModel.nullable(),
    /** Paise, positive. */
    amount: paise,
    description: z.string().nullable(),
    approvalStatus,
    rejectReason: z.string().nullable(),
    decidedAt: z.iso.datetime().nullable(),
    decidedByName: z.string().nullable(),
    importBatchId: z.uuid().nullable(),
    createdAt: z.iso.datetime(),
    createdByName: z.string().nullable(),
    updatedAt: z.iso.datetime(),
    actions: ActionsModel,
  })
  .meta({ id: "ConstructionFinanceTransactionResponseModel" });
export type ConstructionFinanceTransactionResponseModel = z.infer<
  typeof ConstructionFinanceTransactionResponseModel
>;

const AccountRef = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  kind: accountKind.nullable(),
});

export const ConstructionFinanceTransferResponseModel = z
  .object({
    type: z.literal("transfer"),
    id: z.uuid(),
    number: z.string(),
    projectId: z.uuid().nullable(),
    projectName: z.string().nullable(),
    transferDate: z.iso.date(),
    fromAccount: AccountRef,
    toAccount: AccountRef,
    mode,
    reference: z.string().nullable(),
    amount: paise,
    description: z.string().nullable(),
    approvalStatus,
    rejectReason: z.string().nullable(),
    decidedAt: z.iso.datetime().nullable(),
    decidedByName: z.string().nullable(),
    createdAt: z.iso.datetime(),
    createdByName: z.string().nullable(),
    updatedAt: z.iso.datetime(),
    actions: ActionsModel,
  })
  .meta({ id: "ConstructionFinanceTransferResponseModel" });
export type ConstructionFinanceTransferResponseModel = z.infer<
  typeof ConstructionFinanceTransferResponseModel
>;

export const ListConstructionFinanceTransactionsRequestModel = z.object({
  /** The Project's register (read on it); without it, the Company-wide list (Owner only). */
  projectId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** Payment In, Payment Out, or transfers. */
  type: z.enum(["in", "out", "transfer"]).optional(),
  /** A Transaction's account or either side of a transfer. */
  accountId: z.uuid().optional(),
  paymentCategoryId: z.uuid().optional(),
  mode: mode.optional(),
  counterpartyKind: z.enum(COUNTERPARTY_KINDS).optional(),
  approvalStatus: approvalStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  after: z.string().max(200).optional(),
  before: z.string().max(200).optional(),
});

export const ConstructionFinanceRegisterItemModel = z
  .discriminatedUnion("type", [
    ConstructionFinanceTransactionResponseModel,
    ConstructionFinanceTransferResponseModel,
  ])
  .meta({ id: "ConstructionFinanceRegisterItemModel" });
export type ConstructionFinanceRegisterItemModel = z.infer<
  typeof ConstructionFinanceRegisterItemModel
>;

export const ListConstructionFinanceTransactionsResponseModel = z
  .object({
    items: z.array(ConstructionFinanceRegisterItemModel),
    nextCursor: z.string().nullable(),
    prevCursor: z.string().nullable(),
    total: z.int(),
    /** Paise of the filtered rows that are not rejected (only rejected ones when filtering by Rejected). */
    totals: z.object({ in: paise, out: paise, transfer: paise }),
  })
  .meta({
    description:
      "Transactions and transfers, newest first, with the count and the in / out / transfer totals of everything the filters match.",
  });
export type ListConstructionFinanceTransactionsResponseModel = z.infer<
  typeof ListConstructionFinanceTransactionsResponseModel
>;

export const BulkDecideConstructionFinanceTransactionsRequestModel = z
  .object({
    items: z
      .array(
        z.object({ type: z.enum(["transaction", "transfer"]), id: z.uuid() }),
      )
      .min(1)
      .max(100),
    approve: z.boolean(),
    /** Required to reject. */
    reason: z.string().max(500).optional(),
  })
  .meta({
    description:
      "Approve or reject up to 100 Transactions and transfers, all or none: 409 `BULK_DECISION_REFUSED` lists each refusal and nothing changes.",
  });

export const BulkDecideConstructionFinanceTransactionsResponseModel = z.object({
  decided: z.int(),
});

export const ImportConstructionFinanceTransactionsRequestModel = z.object({
  projectId: z.uuid(),
});

export const ImportConstructionFinanceTransactionsResponseModel = z
  .object({ imported: z.int(), importBatchId: z.uuid() })
  .meta({
    description:
      "Every row became a pending Transaction. Any error imports nothing: 400 `IMPORT_HAS_ERRORS` with `details.errors` = [{ row, field, message }].",
  });
