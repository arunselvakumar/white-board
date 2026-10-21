import {
  MULTIPART_FROM_BYTES,
  type UploadAccept,
  type UploadPolicy,
} from "@/src/shared-kernel/attachments/upload-policy";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";

/**
 * Files on inquiries and bookings (CM-1003, CM-1006; ADR CM-0022 §3, §7):
 * `construction_sales.document_files`, keyed by document type and id, each
 * with a **role** — an inquiry's Visiting Card and photos, a booking's
 * Booking Form and photos. Uploaded through the attachments service
 * (CM-0014) like any attachment, but they are personal data: they are
 * **not** indexed in the Project Gallery.
 */

export const SALES_DOCUMENT_TYPES = ["inquiry", "booking"] as const;
export type SalesDocumentType = (typeof SALES_DOCUMENT_TYPES)[number];

export function isSalesDocumentType(value: string): value is SalesDocumentType {
  return (SALES_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export const SALES_FILE_ROLES = [
  "visiting_card",
  "booking_form",
  "photo",
] as const;
export type SalesFileRole = (typeof SALES_FILE_ROLES)[number];

/** Each document's menu, words and the roles its files take. */
export const SALES_DOCUMENTS: Record<
  SalesDocumentType,
  {
    menu: "sales.inquiries" | "sales.bookings";
    code: string;
    label: string;
    roles: readonly SalesFileRole[];
  }
> = {
  inquiry: {
    menu: "sales.inquiries",
    code: "INQUIRY",
    label: "Inquiry",
    roles: ["visiting_card", "photo"],
  },
  booking: {
    menu: "sales.bookings",
    code: "BOOKING",
    label: "Booking",
    roles: ["booking_form", "photo"],
  },
};

/** What each role accepts and how many live files of it a document keeps. */
export const SALES_FILE_ROLE_RULES: Record<
  SalesFileRole,
  { accept: UploadAccept; max: number; label: string }
> = {
  visiting_card: { accept: "images", max: 1, label: "Visiting Card" },
  booking_form: { accept: "pdf_or_image", max: 1, label: "Booking Form" },
  photo: { accept: "images", max: 20, label: "photos" },
};

const MB = 1024 * 1024;

/** The largest file on a sales document. */
export const SALES_FILE_MAX_BYTES = 25 * MB;

/** Key folder: `companies/<workspaceId>/sales-documents/<documentId>/…`. */
export const SALES_FILE_PURPOSE = "sales-documents";

/** `stored_files.kind` of a sales document's file (and `<kind>_thumbnail`). */
export const SALES_FILE_KIND = "sales_document_file";

/** The upload policy of a role (the widest, `pdf_or_image`, when none is known). */
export function salesFilePolicy(role: SalesFileRole | null): UploadPolicy {
  return {
    purpose: SALES_FILE_PURPOSE,
    accept: role == null ? "pdf_or_image" : SALES_FILE_ROLE_RULES[role].accept,
    maxBytes: SALES_FILE_MAX_BYTES,
    multipartFromBytes: MULTIPART_FROM_BYTES,
  };
}

/** A live document as its files see it. */
export type LocatedSalesDocument = {
  type: SalesDocumentType;
  id: string;
  workspaceId: string;
  projectId: string;
  /** The lead's or customer's name, for the audit. */
  label: string;
  /** User id of who created it. */
  createdBy: string;
  /**
   * Team Members who see an inquiry without View all (its Assignee and
   * Lead Owner, CM-0022 §3); null for a booking, which has no View all.
   */
  scopeMemberIds: readonly string[] | null;
};

/** A live file on a document. */
export type SalesDocumentFile = {
  id: string;
  workspaceId: string;
  projectId: string;
  documentType: SalesDocumentType;
  documentId: string;
  role: SalesFileRole;
  fileKey: string;
  fileName: string;
  /** What we serve it as, sniffed from its content. */
  contentType: string;
  bytes: number;
  thumbKey: string | null;
  createdAt: Date;
  createdBy: string;
};

const KEY_UUID =
  /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]{1,10}$/;

/** A file's id is the uuid its key was minted with. */
export function salesFileIdOfKey(key: string): string | null {
  return KEY_UUID.exec(key)?.[1] ?? null;
}

/** 404 `INQUIRY_NOT_FOUND` / `BOOKING_NOT_FOUND`. */
export function salesDocumentNotFound(type: SalesDocumentType): DomainError {
  const { code, label } = SALES_DOCUMENTS[type];
  return notFound(`${code}_NOT_FOUND`, `This ${label} was not found.`);
}

export function unknownSalesDocumentType(): DomainError {
  return notFound("DOCUMENT_NOT_FOUND", "This document was not found.");
}

export function salesFileNotFound(): DomainError {
  return notFound("DOCUMENT_FILE_NOT_FOUND", "This file was not found.");
}

/** 400 `FILE_ROLE_NOT_ALLOWED`: a Booking Form on an inquiry, say. */
export function salesFileRoleNotAllowed(type: SalesDocumentType): DomainError {
  const { label, roles } = SALES_DOCUMENTS[type];
  return new DomainError(
    "FILE_ROLE_NOT_ALLOWED",
    `${/^[AEIOU]/.test(label) ? "An" : "A"} ${label} keeps ${roles.map((role) => SALES_FILE_ROLE_RULES[role].label).join(" and ")} only.`,
    { details: { allowed: roles } },
  );
}

/**
 * 409 `DOCUMENT_FILES_LIMIT` with the role that is full; `BOOKING_FORM_EXISTS`
 * for a booking's second Booking Form (CM-1006).
 */
export function salesFilesLimit(role: SalesFileRole): DomainError {
  const rule = SALES_FILE_ROLE_RULES[role];
  // A booking keeps one Booking Form (CM-1006).
  if (role === "booking_form")
    return conflict(
      "BOOKING_FORM_EXISTS",
      "This booking already has its Booking Form. Remove it first to upload another.",
      { role, max: rule.max },
    );
  return conflict(
    "DOCUMENT_FILES_LIMIT",
    rule.max === 1
      ? `This document already has its ${rule.label}. Remove it first.`
      : `Keep at most ${String(rule.max)} ${rule.label} on a document. Remove one first.`,
    { role, max: rule.max },
  );
}

export function assertSalesFileRole(
  type: SalesDocumentType,
  role: SalesFileRole,
): void {
  if (!SALES_DOCUMENTS[type].roles.includes(role))
    throw salesFileRoleNotAllowed(type);
}
