import {
  MULTIPART_FROM_BYTES,
  type UploadPolicy,
} from "@/src/shared-kernel/attachments/upload-policy";
import { notFound, type DomainError } from "@/src/shared-kernel/domain-error";

import {
  PROCUREMENT_DOCUMENTS,
  type ProcurementDocumentType,
} from "./documents";
import type { StockLocationKind } from "./stock-location";

/**
 * The remarks / comments thread and the files every procurement document
 * shares (ADR CM-0015 §2, CM-0014): `construction_procurement.remarks` and
 * `construction_procurement.document_files`. A file belongs to the
 * document, and optionally to one remark (a comment with photos).
 */

/**
 * One side of a document the Permission Matrix is checked against: a
 * Project id, or null for a Store side, which is checked on the
 * Company-level menu.
 */
export type DocumentScope = string | null;

/** A live document as the thread and files see it. */
export type LocatedDocument = {
  type: ProcurementDocumentType;
  id: string;
  workspaceId: string;
  number: string;
  /** Who raised it: a menu with View all shows others' documents only with it. */
  createdBy: string;
  /**
   * Where its menu is checked: one scope for most documents, two for a
   * Material Transfer (either side may see it).
   */
  scopes: readonly DocumentScope[];
  /** The Project whose Gallery its images and PDFs join, if any. */
  galleryProjectId: string | null;
};

/** A remark (PR, PO) or comment (MT, MR, DN). Never edited or deleted. */
export type DocumentRemark = {
  id: string;
  workspaceId: string;
  documentType: ProcurementDocumentType;
  documentId: string;
  body: string;
  createdAt: Date;
  createdBy: string;
};

/** A live file on a document, or on one of its remarks. */
export type DocumentFile = {
  id: string;
  workspaceId: string;
  documentType: ProcurementDocumentType;
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

/** The largest file on a procurement document. */
export const DOCUMENT_FILE_MAX_BYTES = 25 * MB;

/** Live files one document keeps, its remarks' files included. */
export const DOCUMENT_FILES_MAX = 50;

/** Files one remark may carry. */
export const REMARK_FILES_MAX = 10;

/**
 * Files on procurement documents: PDFs, images, spreadsheets, Word files,
 * CSVs — anything but programs — at most 25 MB. Keys are
 * `companies/<workspaceId>/procurement-documents/<documentId>/…`.
 */
export const DOCUMENT_FILE_POLICY: UploadPolicy = {
  purpose: "procurement-documents",
  accept: "any_but_programs",
  maxBytes: DOCUMENT_FILE_MAX_BYTES,
  multipartFromBytes: MULTIPART_FROM_BYTES,
  programMessage:
    "Programs cannot be attached. Choose a PDF, a picture, a spreadsheet or a document.",
};

/** `stored_files.kind` of a document's file (and `<kind>_thumbnail`). */
export const DOCUMENT_FILE_KIND = "procurement_document_file";

const KEY_UUID =
  /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]{1,10}$/;

/**
 * A file's id is the uuid its key was minted with, so a Gallery row (which
 * keeps the key) links straight to the file's route.
 */
export function documentFileIdOfKey(key: string): string | null {
  return KEY_UUID.exec(key)?.[1] ?? null;
}

/** The scope of a Project or Store location (PO, GRN, MT sides). */
export function locationScope(
  kind: StockLocationKind,
  id: string,
): DocumentScope {
  return kind === "project" ? id : null;
}

/** 404 `<DOCUMENT>_NOT_FOUND`: unknown, another Company's or deleted. */
export function documentNotFound(type: ProcurementDocumentType): DomainError {
  const { naming } = PROCUREMENT_DOCUMENTS[type];
  return notFound(
    `${naming.code}_NOT_FOUND`,
    `This ${naming.label} was not found.`,
  );
}

/** 404 for a document type we do not know. */
export function unknownDocumentType(): DomainError {
  return notFound("DOCUMENT_NOT_FOUND", "This document was not found.");
}

export function documentFileNotFound(): DomainError {
  return notFound("DOCUMENT_FILE_NOT_FOUND", "This file was not found.");
}

/** What the Gallery calls a document's files (`media_items.source`). */
export function gallerySourceOf(type: ProcurementDocumentType): string {
  return type;
}
