import { optionalText } from "@/src/shared-kernel/approval";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  DomainError,
  conflict,
  notFound,
} from "@/src/shared-kernel/domain-error";

import {
  assertAmount,
  type CounterpartyKind,
  type NewAccountEntry,
} from "./ledger";

/**
 * Petty Cash (ADR CM-0017 §2, §4, §9): one account per Team Member and its
 * Payment (cash out), Receipt (cash in) and Transfer (to another petty-cash
 * or a company account) vouchers. A voucher moves money only once
 * approved; its entries are what `voucherEntries` returns.
 */

export const VOUCHER_TYPES = ["payment", "receipt", "transfer"] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  payment: "Payment",
  receipt: "Receipt",
  transfer: "Transfer",
};

export const PETTY_CASH_VOUCHER = {
  code: "PETTY_CASH_VOUCHER",
  label: "petty-cash voucher",
} as const;

export const PETTY_CASH_TEXT_MAX = 500;
export const PETTY_CASH_NAME_MAX = 120;

/** "Petty cash — Ravi Kumar", the name an account gets unless one is typed. */
export function defaultPettyCashAccountName(holderName: string): string {
  return `Petty cash — ${holderName}`.slice(0, PETTY_CASH_NAME_MAX);
}

/** A typed account name: trimmed, required, ≤ 120. */
export function pettyCashAccountName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length === 0)
    throw new DomainError("ACCOUNT_NAME_REQUIRED", "Enter the account name.", {
      details: { field: "name" },
    });
  if (name.length > PETTY_CASH_NAME_MAX)
    throw new DomainError(
      "ACCOUNT_NAME_TOO_LONG",
      `Use at most ${String(PETTY_CASH_NAME_MAX)} characters.`,
      { details: { field: "name" } },
    );
  return name;
}

export type CounterpartyInput = {
  kind: CounterpartyKind | null;
  id: string | null;
  name: string | null;
};

/** What a voucher says, before its account and number. */
export type VoucherContent = {
  voucherType: VoucherType;
  voucherDate: CalendarDate;
  projectId: string | null;
  counterparty: CounterpartyInput;
  toAccountId: string | null;
  paymentCategoryId: string | null;
  /** Paise, positive. */
  amount: bigint;
  paidFor: string | null;
  reference: string | null;
  description: string | null;
};

/**
 * Checks a voucher's fields (CM-0017 §9): a Transfer names another account
 * and no Payment Category; a Payment or Receipt names a Payment Category
 * and no account to move to. Texts are trimmed (≤ 500, a typed name ≤
 * 120); empty is null.
 */
export function voucherContent(
  accountId: string,
  input: VoucherContent,
): VoucherContent {
  assertAmount(input.amount);
  const toAccountId = input.toAccountId ?? null;
  const paymentCategoryId = input.paymentCategoryId ?? null;
  if (input.voucherType === "transfer") {
    if (toAccountId == null)
      throw new DomainError(
        "TO_ACCOUNT_REQUIRED",
        "Choose the account the money goes to.",
        { details: { field: "toAccountId" } },
      );
    if (toAccountId === accountId)
      throw new DomainError(
        "TO_ACCOUNT_SAME",
        "Choose an account other than this one.",
        { details: { field: "toAccountId" } },
      );
  } else if (paymentCategoryId == null)
    throw new DomainError(
      "PAYMENT_CATEGORY_REQUIRED",
      "Choose a Payment Category.",
      { details: { field: "paymentCategoryId" } },
    );
  const typedName = optionalText(input.counterparty.name, "counterparty.name");
  if (typedName != null && typedName.length > PETTY_CASH_NAME_MAX)
    throw new DomainError(
      "TEXT_TOO_LONG",
      `Use at most ${String(PETTY_CASH_NAME_MAX)} characters.`,
      { details: { field: "counterparty.name" } },
    );
  const kind = input.counterparty.kind ?? null;
  const id = kind == null ? null : (input.counterparty.id ?? null);
  if (kind != null && id == null)
    throw new DomainError(
      "COUNTERPARTY_NOT_FOUND",
      "Choose the party from the list, or type a name.",
      { details: { field: "counterparty" } },
    );
  return {
    voucherType: input.voucherType,
    voucherDate: input.voucherDate,
    projectId: input.projectId ?? null,
    counterparty: { kind, id, name: typedName },
    toAccountId: input.voucherType === "transfer" ? toAccountId : null,
    paymentCategoryId:
      input.voucherType === "transfer" ? null : paymentCategoryId,
    amount: input.amount,
    paidFor: optionalText(input.paidFor, "paidFor"),
    reference: optionalText(input.reference, "reference"),
    description: optionalText(input.description, "description"),
  };
}

/** A voucher as approval posts it. */
export type PostableVoucher = VoucherContent & {
  id: string;
  number: string;
  accountId: string;
};

/**
 * The account entries an approved voucher posts (CM-0017 §9): a Payment
 * takes the amount out of its account, a Receipt puts it in, a Transfer
 * takes it out of its account and puts it into the other. Each copies
 * what the Ledger Report filters on.
 */
export function voucherEntries(voucher: PostableVoucher): NewAccountEntry[] {
  const common = {
    projectId: voucher.projectId,
    entryDate: voucher.voucherDate,
    mode: "cash" as const,
    reference: voucher.reference,
    paymentCategoryId: voucher.paymentCategoryId,
    counterpartyKind: voucher.counterparty.kind,
    counterpartyId: voucher.counterparty.id,
    counterpartyName: voucher.counterparty.name,
    documentNumber: voucher.number,
    narration: voucher.paidFor ?? voucher.description,
    sourceType: "petty_cash_voucher" as const,
    sourceId: voucher.id,
  };
  switch (voucher.voucherType) {
    case "payment":
      return [
        {
          ...common,
          accountId: voucher.accountId,
          kind: "payment",
          amount: -voucher.amount,
        },
      ];
    case "receipt":
      return [
        {
          ...common,
          accountId: voucher.accountId,
          kind: "receipt",
          amount: voucher.amount,
        },
      ];
    case "transfer": {
      if (voucher.toAccountId == null)
        throw new Error("A transfer voucher names its to-account.");
      return [
        {
          ...common,
          accountId: voucher.accountId,
          kind: "transfer_out",
          amount: -voucher.amount,
        },
        {
          ...common,
          accountId: voucher.toAccountId,
          kind: "transfer_in",
          amount: voucher.amount,
        },
      ];
    }
  }
}

/**
 * What a pending voucher would do to `accountId` once approved (+ in, −
 * out): the "pending" figure beside a balance.
 */
export function pendingEffect(
  voucher: Pick<VoucherContent, "voucherType" | "amount" | "toAccountId"> & {
    accountId: string;
  },
  accountId: string,
): bigint {
  if (voucher.accountId === accountId)
    return voucher.voucherType === "receipt" ? voucher.amount : -voucher.amount;
  if (voucher.voucherType === "transfer" && voucher.toAccountId === accountId)
    return voucher.amount;
  return 0n;
}

export function pettyCashAccountNotFound(): DomainError {
  return notFound(
    "PETTY_CASH_ACCOUNT_NOT_FOUND",
    "This petty-cash account was not found.",
  );
}

export function pettyCashAccountExists(holderName: string): DomainError {
  return conflict(
    "PETTY_CASH_ACCOUNT_EXISTS",
    `${holderName} already has a petty-cash account.`,
    { field: "holderMemberId" },
  );
}

export function pettyCashAccountInUse(): DomainError {
  return conflict(
    "PETTY_CASH_ACCOUNT_IN_USE",
    "This account has vouchers or other entries, so it cannot be closed.",
  );
}

export function voucherNotFound(): DomainError {
  return notFound(
    "PETTY_CASH_VOUCHER_NOT_FOUND",
    "This petty-cash voucher was not found.",
  );
}

export function voucherChanged(): DomainError {
  return conflict(
    "PETTY_CASH_VOUCHER_CHANGED",
    "Someone changed this voucher after you opened it. Reload it and try again.",
  );
}

/** The most voucher files one Export Receipts ZIP carries (CM-0017 §9). */
export const RECEIPTS_ZIP_MAX_FILES = 500;

export function tooManyReceipts(count: number): DomainError {
  return conflict(
    "TOO_MANY_RECEIPTS",
    `These dates have ${String(count)} files; one download carries at most ${String(RECEIPTS_ZIP_MAX_FILES)}. Choose fewer days.`,
    { count, max: RECEIPTS_ZIP_MAX_FILES },
  );
}

/**
 * The name a voucher's file gets in the Export Receipts ZIP:
 * `PC-26-27-00001 1.jpg` (slashes are not allowed in a ZIP entry's name).
 */
export function receiptEntryName(
  number: string,
  index: number,
  fileName: string,
): string {
  const dot = fileName.lastIndexOf(".");
  const extension =
    dot > 0
      ? fileName
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      : "";
  const safe = number.replace(/[/\\]/g, "-");
  return `${safe} ${String(index)}${extension === "" ? "" : `.${extension}`}`;
}
