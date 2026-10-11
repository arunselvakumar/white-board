import {
  MULTIPART_FROM_BYTES,
  type UploadAccept,
  type UploadPolicy,
} from "@/src/shared-kernel/attachments/upload-policy";
import { notFound, type DomainError } from "@/src/shared-kernel/domain-error";
import type { ProjectMediaRemoved } from "@/src/shared-kernel/project-media";

import {
  SITE_WORK_DOCUMENTS,
  type SiteWorkDocumentType,
} from "./site-work-documents";

/**
 * The remarks thread and the files every site-work document shares (ADR
 * CM-0016 §8, CM-0014): `construction_site_work.remarks` and
 * `construction_site_work.document_files`. A file belongs to the document,
 * and optionally to one remark (a remark with photos).
 */

/** A live document as the thread and files see it. */
export type LocatedSiteWorkDocument = {
  type: SiteWorkDocumentType;
  id: string;
  workspaceId: string;
  /** Every site-work document is on one Project; its menu is checked there. */
  projectId: string;
  /** Its number (`WS/26-27/00001`), or a Site Diary's date (`2026-10-08`). */
  label: string;
  /** Who raised it. */
  createdBy: string;
};

/** A remark. Never edited or deleted. */
export type SiteWorkRemark = {
  id: string;
  workspaceId: string;
  documentType: SiteWorkDocumentType;
  documentId: string;
  body: string;
  createdAt: Date;
  createdBy: string;
};

/** A live file on a document, or on one of its remarks. */
export type SiteWorkDocumentFile = {
  id: string;
  workspaceId: string;
  documentType: SiteWorkDocumentType;
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

/** The largest file on a site-work document (CM-0016 §8). */
export const SITE_WORK_FILE_MAX_BYTES = 25 * MB;

/** Live files one document keeps, its remarks' files included (CM-0016 §8). */
export const SITE_WORK_DOCUMENT_FILES_MAX = 20;

/** Files one remark may carry. */
export const SITE_WORK_REMARK_FILES_MAX = 10;

/** Key folder: `companies/<workspaceId>/site-work-documents/<documentId>/…`. */
export const SITE_WORK_FILE_PURPOSE = "site-work-documents";

/** `stored_files.kind` of a document's file (and `<kind>_thumbnail`). */
export const SITE_WORK_FILE_KIND = "site_work_document_file";

/**
 * What each document accepts (CM-0016 §8): worksheet and Site Diary photos
 * are images only; usage-sheet and hindrance files may also be PDFs.
 */
export const SITE_WORK_FILE_ACCEPTS: Record<
  SiteWorkDocumentType,
  UploadAccept
> = {
  worksheet: "images",
  site_diary: "images",
  equipment_usage: "pdf_or_image",
  hindrance: "pdf_or_image",
};

/** The upload policy of a document type's files. */
export function siteWorkFilePolicy(type: SiteWorkDocumentType): UploadPolicy {
  return {
    purpose: SITE_WORK_FILE_PURPOSE,
    accept: SITE_WORK_FILE_ACCEPTS[type],
    maxBytes: SITE_WORK_FILE_MAX_BYTES,
    multipartFromBytes: MULTIPART_FROM_BYTES,
  };
}

/** Whether a document type takes only images (photos). */
export function takesImagesOnly(type: SiteWorkDocumentType): boolean {
  return SITE_WORK_FILE_ACCEPTS[type] === "images";
}

const KEY_UUID =
  /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]{1,10}$/;

/**
 * A file's id is the uuid its key was minted with, so a Gallery row (which
 * keeps the key) links straight to the file's route.
 */
export function siteWorkFileIdOfKey(key: string): string | null {
  return KEY_UUID.exec(key)?.[1] ?? null;
}

/** 404 `<DOCUMENT>_NOT_FOUND`: unknown, another Company's or deleted. */
export function siteWorkDocumentNotFound(
  type: SiteWorkDocumentType,
): DomainError {
  const { naming } = SITE_WORK_DOCUMENTS[type];
  return notFound(
    `${naming.code}_NOT_FOUND`,
    `This ${naming.label} was not found.`,
  );
}

/** 404 for a document type we do not know. */
export function unknownSiteWorkDocumentType(): DomainError {
  return notFound("DOCUMENT_NOT_FOUND", "This document was not found.");
}

export function siteWorkFileNotFound(): DomainError {
  return notFound("DOCUMENT_FILE_NOT_FOUND", "This file was not found.");
}

/** What the Gallery calls a document's files (`media_items.source`). */
export function siteWorkGallerySource(type: SiteWorkDocumentType): string {
  return type;
}

/**
 * Only images join the Project Gallery (CM-0016 §8); a usage sheet's or
 * hindrance's PDF stays on the document.
 */
export const SITE_WORK_GALLERY_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export function joinsGallery(contentType: string): boolean {
  return SITE_WORK_GALLERY_TYPES.includes(contentType);
}

/**
 * The event a document's own delete dispatches after commit, so its photos
 * leave the Project Gallery (every file of the document at once). Its
 * files themselves stay as rows of a deleted document.
 */
export function siteWorkDocumentMediaRemoved(input: {
  workspaceId: string;
  projectId: string;
  type: SiteWorkDocumentType;
  documentId: string;
  at: Date;
}): ProjectMediaRemoved {
  return {
    type: "ProjectMediaRemoved",
    workspaceId: input.workspaceId,
    occurredAt: input.at,
    projectId: input.projectId,
    source: siteWorkGallerySource(input.type),
    sourceId: input.documentId,
  };
}
