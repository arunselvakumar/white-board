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
import {
  isGalleryContentType,
  type ProjectMediaRemoved,
} from "@/src/shared-kernel/project-media";

import {
  TRACKING_DOCUMENTS,
  type TrackingDocumentType,
} from "./tracking-documents";

/**
 * Files on tasks, issues and inspections (ADR CM-0019 §11):
 * `construction_tracking.document_files`, keyed by document type and id,
 * optionally by an **entry** of the document — a task's progress update,
 * an issue's update, an inspection's observation. Uploaded through the
 * attachments service (CM-0014); images and PDFs join the Project Gallery.
 *
 * An entry's files are uploaded to the document first (`entry_id` null),
 * then attached by id when the entry is posted (`attachEntryFiles`).
 */

/** A live document as its files see it. */
export type LocatedTrackingDocument = {
  type: TrackingDocumentType;
  id: string;
  workspaceId: string;
  /** Every tracking document is on one Project; its menu is checked there. */
  projectId: string;
  /** `T-12`, `ISS/26-27/00001`, `IR/26-27/00001`. */
  label: string;
  /** User id of who raised it. */
  createdBy: string;
  /**
   * Team Member ids the document is assigned to (task assignees, the issue's
   * Assign To). Without View all a member reads only documents they created
   * or are assigned to (CM-0019 §5, §8). Null for inspections, which have no
   * View all: Read sees them all (§9).
   */
  assigneeMemberIds: readonly string[] | null;
  /**
   * An inspection's status and inspector (CM-804); null for tasks and
   * issues. A decided inspection's files are final, and its inspector may
   * upload files for their observations while it is pending.
   */
  inspection: TrackingInspectionFileFacts | null;
};

/** What the files of an inspection depend on (CM-0019 §9). */
export type TrackingInspectionFileFacts = {
  status: "pending" | "approved" | "rejected";
  /** Team Member id; null when no inspector is named. */
  inspectorMemberId: string | null;
};

/**
 * 409 `INSPECTION_DECIDED`: an approved or rejected Inspection Request is
 * final, so neither its own files nor its observations' files change.
 */
export function inspectionFilesFinal(status: "approved" | "rejected") {
  return conflict(
    "INSPECTION_DECIDED",
    `This Inspection Request is ${status}; its files can no longer change.`,
    { status },
  );
}

/** A live file on a document, or on one of its entries. */
export type TrackingDocumentFile = {
  id: string;
  workspaceId: string;
  projectId: string;
  documentType: TrackingDocumentType;
  documentId: string;
  /** The progress update / issue update / observation it was posted with. */
  entryId: string | null;
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

/** The largest file on a tracking document. */
export const TRACKING_FILE_MAX_BYTES = 25 * MB;

/**
 * Live files one document keeps, its entries' included: a task gathers
 * photos from every progress update, so the cap is high.
 */
export const TRACKING_DOCUMENT_FILES_MAX = 200;

/** Files one entry (an update or observation) may carry. */
export const TRACKING_ENTRY_FILES_MAX = 10;

/** Key folder: `companies/<workspaceId>/tracking-documents/<documentId>/…`. */
export const TRACKING_FILE_PURPOSE = "tracking-documents";

/** `stored_files.kind` of a document's file (and `<kind>_thumbnail`). */
export const TRACKING_FILE_KIND = "tracking_document_file";

/**
 * What each document accepts (CM-0019 §11): task photos are images only;
 * issue attachments and inspection files may also be PDFs. (An issue
 * update's composer asks for images only on the client.)
 */
export const TRACKING_FILE_ACCEPTS: Record<TrackingDocumentType, UploadAccept> =
  {
    task: "images",
    issue: "pdf_or_image",
    inspection: "pdf_or_image",
  };

export function trackingFilePolicy(type: TrackingDocumentType): UploadPolicy {
  return {
    purpose: TRACKING_FILE_PURPOSE,
    accept: TRACKING_FILE_ACCEPTS[type],
    maxBytes: TRACKING_FILE_MAX_BYTES,
    multipartFromBytes: MULTIPART_FROM_BYTES,
  };
}

/** Whether a document type takes only images (photos). */
export function trackingTakesImagesOnly(type: TrackingDocumentType): boolean {
  return TRACKING_FILE_ACCEPTS[type] === "images";
}

const KEY_UUID =
  /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]{1,10}$/;

/**
 * A file's id is the uuid its key was minted with, so a Gallery row (which
 * keeps the key) links straight to the file's route.
 */
export function trackingFileIdOfKey(key: string): string | null {
  return KEY_UUID.exec(key)?.[1] ?? null;
}

/** 404 `<DOCUMENT>_NOT_FOUND`: unknown, another Company's or deleted. */
export function trackingDocumentNotFound(
  type: TrackingDocumentType,
): DomainError {
  const { naming } = TRACKING_DOCUMENTS[type];
  return notFound(
    `${naming.code}_NOT_FOUND`,
    `This ${naming.label} was not found.`,
  );
}

/** 404 for a document type we do not know. */
export function unknownTrackingDocumentType(): DomainError {
  return notFound("DOCUMENT_NOT_FOUND", "This document was not found.");
}

export function trackingFileNotFound(): DomainError {
  return notFound("DOCUMENT_FILE_NOT_FOUND", "This file was not found.");
}

/** 400 when an entry names files that are not the poster's own unposted uploads. */
export function entryFilesNotFound(fileIds: readonly string[]): DomainError {
  return new DomainError(
    "DOCUMENT_FILE_NOT_FOUND",
    "Upload the files again, then post.",
    { details: { fileIds: [...fileIds] } },
  );
}

export function entryFilesTooMany(): DomainError {
  return new DomainError(
    "ENTRY_FILES_TOO_MANY",
    `Attach at most ${String(TRACKING_ENTRY_FILES_MAX)} files to one entry.`,
  );
}

/** What the Gallery calls a document's files (`media_items.source`). */
export function trackingGallerySource(type: TrackingDocumentType): string {
  return TRACKING_DOCUMENTS[type].gallerySource;
}

/** Images and PDFs join the Project Gallery (CM-0019 §11). */
export function trackingFileJoinsGallery(contentType: string): boolean {
  return isGalleryContentType(contentType);
}

/**
 * The event a document's own delete dispatches after commit, so its files
 * leave the Project Gallery (every file of the document at once). The file
 * rows stay as rows of a deleted document.
 */
export function trackingDocumentMediaRemoved(input: {
  workspaceId: string;
  projectId: string;
  type: TrackingDocumentType;
  documentId: string;
  at: Date;
}): ProjectMediaRemoved {
  return {
    type: "ProjectMediaRemoved",
    workspaceId: input.workspaceId,
    occurredAt: input.at,
    projectId: input.projectId,
    source: trackingGallerySource(input.type),
    sourceId: input.documentId,
  };
}

/**
 * The events that take an entry's files out of the Gallery once the entry
 * (and its files, with `tombstoneEntryFiles`) is deleted; one per file.
 */
export function trackingFilesMediaRemoved(
  files: readonly TrackingDocumentFile[],
  at: Date,
): ProjectMediaRemoved[] {
  return files
    .filter((file) => trackingFileJoinsGallery(file.contentType))
    .map((file) => ({
      type: "ProjectMediaRemoved",
      workspaceId: file.workspaceId,
      occurredAt: at,
      projectId: file.projectId,
      source: trackingGallerySource(file.documentType),
      sourceId: file.documentId,
      fileKey: file.fileKey,
    }));
}
