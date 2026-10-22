import { z } from "zod";

/** Which accounts fit a payment mode (ADR CM-0017 §5); `bank` is labour's and HRMS's Bank. */
export const FINANCE_ACCOUNT_OPTION_MODES = [
  "cash",
  "cheque",
  "online",
  "upi",
  "bank",
] as const;

export const GetConstructionFinanceAccountOptionsRequestModel = z.object({
  mode: z.enum(FINANCE_ACCOUNT_OPTION_MODES).optional(),
});

export const ConstructionFinanceAccountOptionModel = z
  .object({
    id: z.uuid(),
    name: z.string(),
    kind: z.enum(["cash", "bank", "petty_cash"]),
    isPrimary: z.boolean(),
    holderMemberId: z.uuid().nullable(),
    holderName: z.string().nullable(),
    isOwn: z.boolean(),
  })
  .meta({ id: "ConstructionFinanceAccountOptionModel" });

export const GetConstructionFinanceAccountOptionsResponseModel = z
  .object({ items: z.array(ConstructionFinanceAccountOptionModel) })
  .meta({
    description:
      "Accounts the caller may pay from or receive into, for the account picker: every company account, and their own petty cash (every petty-cash account with Petty Cash View all). Filtered by mode when given: Cash → Cash and petty cash; Cheque, Online, UPI, Bank → Bank.",
  });
export type GetConstructionFinanceAccountOptionsResponseModel = z.infer<
  typeof GetConstructionFinanceAccountOptionsResponseModel
>;

// ---------------------------------------------------------------------------
// Masters → Company's Bank A/C (CM-701)
// ---------------------------------------------------------------------------

export const FINANCE_ACCOUNTS_PATH = "/api/construction/finance/accounts";

/** Paise as a safe integer; signed where the comment says so. */
const paise = z.int();

const CompanyAccountBody = z.object({
  name: z.string().max(200),
  /** Bank only. */
  bankName: z.string().max(200).nullable().optional(),
  /** Bank only: letters and digits (spaces and hyphens are dropped). */
  accountNumber: z.string().max(40).nullable().optional(),
  /** Bank only: upper-cased, then four letters, `0`, six letters or digits. */
  ifsc: z.string().max(20).nullable().optional(),
  /** Bank only. */
  branch: z.string().max(200).nullable().optional(),
  /** Paise, signed (an overdraft is negative); 0 posts no opening entry. */
  openingBalance: paise,
  /** `YYYY-MM-DD`, not after today: the opening entry's date. */
  openingDate: z.iso.date(),
});

export const CreateConstructionFinanceAccountRequestModel =
  CompanyAccountBody.extend({ kind: z.enum(["cash", "bank"]) }).meta({
    description:
      "A company Cash or Bank account. Names are unique among live accounts, ignoring case (409 `ACCOUNT_NAME_TAKEN`); bank fields only on a Bank account; a malformed IFSC is 400 `IFSC_INVALID`.",
  });

export const UpdateConstructionFinanceAccountRequestModel =
  CompanyAccountBody.extend({
    /** The account's `updatedAt` as last seen; 409 `ACCOUNT_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  }).meta({
    description:
      "Rename, bank details, opening balance and date. A changed opening posts the reversal of the old opening entry and a new one. The kind does not change.",
  });

export const DeleteConstructionFinanceAccountRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ConstructionFinanceAccountParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionFinanceAccountResponseModel = z
  .object({
    id: z.uuid(),
    kind: z.enum(["cash", "bank"]),
    name: z.string(),
    bankName: z.string().nullable(),
    accountNumber: z.string().nullable(),
    ifsc: z.string().nullable(),
    branch: z.string().nullable(),
    isPrimary: z.boolean(),
    isSeed: z.boolean(),
    /** Paise, signed. */
    openingBalance: paise,
    openingDate: z.iso.date(),
    /** Paise, signed: every entry up to today (Company time zone). */
    balance: paise,
    /** Pending documents naming the account and their signed total if approved. */
    pending: z.object({ count: z.int(), total: paise }),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "ConstructionFinanceAccountResponseModel" });
export type ConstructionFinanceAccountResponseModel = z.infer<
  typeof ConstructionFinanceAccountResponseModel
>;

export const ListConstructionFinanceAccountsResponseModel = z
  .object({ items: z.array(ConstructionFinanceAccountResponseModel) })
  .meta({
    description:
      "The Company's Cash and Bank accounts, primary first, then by name, with today's balance and pending documents. Petty-cash accounts are listed under Petty Cash.",
  });
export type ListConstructionFinanceAccountsResponseModel = z.infer<
  typeof ListConstructionFinanceAccountsResponseModel
>;

export const ACCOUNT_ENTRY_SOURCES = [
  "account",
  "transaction",
  "account_transfer",
  "petty_cash_voucher",
  "other_expense",
  "party_payment",
  "wage_payment",
  "salary_slip",
] as const;

export const GetConstructionFinanceAccountStatementRequestModel = z.object({
  /** `YYYY-MM-DD`; the 1st of `to`'s month by default. At most 366 days. */
  from: z.iso.date().optional(),
  /** `YYYY-MM-DD`; today by default. */
  to: z.iso.date().optional(),
  sourceType: z.enum(ACCOUNT_ENTRY_SOURCES).optional(),
  paymentCategoryId: z.uuid().optional(),
  mode: z.enum(["cash", "cheque", "online", "upi"]).optional(),
  counterpartyKind: z
    .enum([
      "contractor",
      "supplier",
      "other_party",
      "labour",
      "vendor",
      "team_member",
      "client",
    ])
    .optional(),
});

export const ConstructionFinanceAccountStatementLineModel = z
  .object({
    id: z.uuid(),
    entryDate: z.iso.date(),
    kind: z.enum([
      "opening",
      "receipt",
      "payment",
      "transfer_in",
      "transfer_out",
    ]),
    /** Paise, signed: + in, − out. */
    amount: paise,
    /** Paise: the balance after this line. */
    balance: paise,
    sourceType: z.enum(ACCOUNT_ENTRY_SOURCES),
    sourceId: z.uuid(),
    documentNumber: z.string().nullable(),
    counterpartyName: z.string().nullable(),
    mode: z.enum(["cash", "cheque", "online", "upi"]).nullable(),
    reference: z.string().nullable(),
    paymentCategoryName: z.string().nullable(),
    /** The Project's (or Store's) name. */
    projectName: z.string().nullable(),
    narration: z.string().nullable(),
    /** A line cancelling an earlier one (an edit, delete or changed opening). */
    isReversal: z.boolean(),
  })
  .meta({ id: "ConstructionFinanceAccountStatementLineModel" });

export const GetConstructionFinanceAccountStatementResponseModel = z
  .object({
    account: z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.enum(["cash", "bank", "petty_cash"]),
      holderName: z.string().nullable(),
    }),
    from: z.iso.date(),
    to: z.iso.date(),
    /** Paise: matching entries before `from`. */
    opening: paise,
    entries: z.array(ConstructionFinanceAccountStatementLineModel),
    totalIn: paise,
    totalOut: paise,
    closing: paise,
  })
  .meta({
    description:
      "An account's statement (Ledger): opening, every entry in the period with its running balance, total in and out, closing. Filters apply to the opening too.",
  });
export type GetConstructionFinanceAccountStatementResponseModel = z.infer<
  typeof GetConstructionFinanceAccountStatementResponseModel
>;
