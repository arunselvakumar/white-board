import type { MenuKey } from "@/src/shared-kernel/access/menus";
import type { DocumentNaming } from "@/src/shared-kernel/approval";
import {
  MULTIPART_FROM_BYTES,
  type UploadAccept,
  type UploadPolicy,
} from "@/src/shared-kernel/attachments/upload-policy";
import { notFound, type DomainError } from "@/src/shared-kernel/domain-error";

/**
 * The finance documents that carry a remarks thread and files (ADR
 * CM-0017): `construction_finance.document_type`. Each is wired to its
 * table, the column its number lives in, the column of its Project, the
 * Permission Matrix menu it is checked on (CM-0017 §14) and the naming its
 * errors use.
 */
export const FINANCE_DOCUMENT_TYPES = [
  "transaction",
  "account_transfer",
  "petty_cash_voucher",
  "other_expense",
  "invoice",
  "party_payment",
  "settlement",
] as const;
export type FinanceDocumentType = (typeof FINANCE_DOCUMENT_TYPES)[number];

export type FinanceDocument = {
  type: FinanceDocumentType;
  naming: DocumentNaming;
  /** `construction_finance.<table>`. */
  table: string;
  /**
   * The column the document is known by (`TXN/26-27/00001`, a typed
   * invoice number); null for a settlement, known by its invoice.
   */
  numberColumn: string | null;
  /**
   * The column naming its Project; null for a settlement, which takes its
   * invoice's Project (or Store).
   */
  projectColumn: string | null;
  menu: MenuKey;
};

export const FINANCE_DOCUMENTS: Record<FinanceDocumentType, FinanceDocument> = {
  transaction: {
    type: "transaction",
    naming: { code: "TRANSACTION", label: "Transaction" },
    table: "transactions",
    numberColumn: "number",
    projectColumn: "project_id",
    menu: "finance.transactions",
  },
  account_transfer: {
    type: "account_transfer",
    naming: { code: "ACCOUNT_TRANSFER", label: "transfer" },
    table: "account_transfers",
    numberColumn: "number",
    projectColumn: "project_id",
    menu: "finance.transactions",
  },
  petty_cash_voucher: {
    type: "petty_cash_voucher",
    naming: { code: "PETTY_CASH_VOUCHER", label: "petty-cash voucher" },
    table: "petty_cash_vouchers",
    numberColumn: "number",
    projectColumn: "project_id",
    menu: "finance.petty_cash",
  },
  other_expense: {
    type: "other_expense",
    naming: { code: "OTHER_EXPENSE", label: "Other Expense" },
    table: "other_expenses",
    numberColumn: "number",
    projectColumn: "project_id",
    menu: "finance.other_expenses",
  },
  invoice: {
    type: "invoice",
    naming: { code: "INVOICE", label: "invoice" },
    table: "invoices",
    numberColumn: "invoice_number",
    projectColumn: "project_id",
    menu: "finance.parties",
  },
  party_payment: {
    type: "party_payment",
    naming: { code: "PARTY_PAYMENT", label: "payment" },
    table: "party_payments",
    numberColumn: "number",
    projectColumn: "project_id",
    menu: "finance.parties",
  },
  settlement: {
    type: "settlement",
    naming: { code: "SETTLEMENT", label: "settlement" },
    table: "settlements",
    numberColumn: null,
    projectColumn: null,
    menu: "finance.parties",
  },
};

export function isFinanceDocumentType(
  value: string,
): value is FinanceDocumentType {
  return (FINANCE_DOCUMENT_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// The document thread: remarks and files (`construction_finance.remarks`,
// `construction_finance.document_files`), as in site work and procurement.
// ---------------------------------------------------------------------------

/** A live finance document as the thread and files see it. */
export type LocatedFinanceDocument = {
  type: FinanceDocumentType;
  id: string;
  workspaceId: string;
  /** The Project its menu is checked on; null when it names none. */
  projectId: string | null;
  /** A Store-located invoice or payment (CM-0017 §14: Owner only). */
  storeId: string | null;
  /** Its number (`PC/26-27/00001`), or what it is known by. */
  label: string;
  /** Who raised it. */
  createdBy: string;
  /**
   * A petty-cash voucher's account holder (their User id, null when the
   * holder never joined); null on other documents.
   */
  holderUserId: string | null;
};

/** A remark. Never edited or deleted. */
export type FinanceRemark = {
  id: string;
  workspaceId: string;
  documentType: FinanceDocumentType;
  documentId: string;
  body: string;
  createdAt: Date;
  createdBy: string;
};

/** A live file on a document, or on one of its remarks. */
export type FinanceDocumentFile = {
  id: string;
  workspaceId: string;
  documentType: FinanceDocumentType;
  documentId: string;
  remarkId: string | null;
  fileKey: string;
  fileName: string;
  /** What we serve it as, sniffed from its content. */
  contentType: string;
  bytes: number;
  thumbKey: string | null;
  createdAt: Date;
  createdBy: string;
};

const MB = 1024 * 1024;

/** The largest file on a finance document. */
export const FINANCE_FILE_MAX_BYTES = 25 * MB;

/** Live files one document keeps, its remarks' files included. */
export const FINANCE_DOCUMENT_FILES_MAX = 20;

/** Files one remark may carry. */
export const FINANCE_REMARK_FILES_MAX = 10;

/** Key folder: `companies/<workspaceId>/finance-documents/<documentId>/…`. */
export const FINANCE_FILE_PURPOSE = "finance-documents";

/** `stored_files.kind` of a document's file (and `<kind>_thumbnail`). */
export const FINANCE_FILE_KIND = "finance_document_file";

/**
 * Every finance document takes receipts, voucher photos and invoice copies:
 * a PDF or an image (PNG, JPEG, WebP). They never join the Project Gallery:
 * a receipt is not a site photo.
 */
export const FINANCE_FILE_ACCEPT: UploadAccept = "pdf_or_image";

export function financeFilePolicy(): UploadPolicy {
  return {
    purpose: FINANCE_FILE_PURPOSE,
    accept: FINANCE_FILE_ACCEPT,
    maxBytes: FINANCE_FILE_MAX_BYTES,
    multipartFromBytes: MULTIPART_FROM_BYTES,
  };
}

const KEY_UUID =
  /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]{1,10}$/;

/** A file's id is the uuid its key was minted with. */
export function financeFileIdOfKey(key: string): string | null {
  return KEY_UUID.exec(key)?.[1] ?? null;
}

/** 404 `<DOCUMENT>_NOT_FOUND`: unknown, another Company's, deleted or hidden. */
export function financeDocumentNotFound(
  type: FinanceDocumentType,
): DomainError {
  const { naming } = FINANCE_DOCUMENTS[type];
  return notFound(
    `${naming.code}_NOT_FOUND`,
    `This ${naming.label} was not found.`,
  );
}

/** 404 for a document type we do not know. */
export function unknownFinanceDocumentType(): DomainError {
  return notFound("DOCUMENT_NOT_FOUND", "This document was not found.");
}

export function financeFileNotFound(): DomainError {
  return notFound("DOCUMENT_FILE_NOT_FOUND", "This file was not found.");
}
