import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { NewStoredFile } from "@/src/shared-kernel/files";

import type {
  LocatedTrackingDocument,
  TrackingDocumentFile,
} from "../domain/document-files";
import type { TrackingDocumentType } from "../domain/tracking-documents";

/**
 * Ports of the tracking document files (CM-0019 §11). They live beside the
 * service rather than in `ports.ts`, which the feature tickets extend.
 */

/** Finds a live document of the Company in its own table. */
export type TrackingDocumentLocator = {
  locate(
    workspaceId: string,
    type: TrackingDocumentType,
    id: string,
  ): Promise<LocatedTrackingDocument | null>;
};

/** A file as stored, `deletedAt` set once it was removed (its key stays taken). */
export type StoredTrackingDocumentFile = TrackingDocumentFile & {
  deletedAt: Date | null;
};

/**
 * `construction_tracking.document_files`. Every write is one transaction
 * that first locks the document's row, so a document deleted meanwhile
 * gets no new file (404 `<DOCUMENT>_NOT_FOUND`).
 */
export type TrackingDocumentFileStore = {
  /** Live files, oldest first, entries' files included. */
  files(
    workspaceId: string,
    type: TrackingDocumentType,
    documentId: string,
  ): Promise<TrackingDocumentFile[]>;
  countFiles(
    workspaceId: string,
    type: TrackingDocumentType,
    documentId: string,
  ): Promise<number>;
  /** A live file of the document, or null. */
  file(
    workspaceId: string,
    type: TrackingDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<TrackingDocumentFile | null>;
  /** The file at this key, live or removed, or null. */
  fileByKey(
    workspaceId: string,
    type: TrackingDocumentType,
    documentId: string,
    key: string,
  ): Promise<StoredTrackingDocumentFile | null>;
  /**
   * Inserts the file with its `stored_files` rows and audit event: 409
   * `DOCUMENT_FILES_LIMIT` at `maxFiles` live files; `duplicate` when a
   * row already has this key (a retried completion won the race).
   */
  addFile(input: {
    document: LocatedTrackingDocument;
    file: TrackingDocumentFile;
    storedFiles: readonly NewStoredFile[];
    audit: AuditEvent;
    maxFiles: number;
  }): Promise<"added" | "duplicate">;
  /** Tombstones the file and stops counting its bytes; false when already gone. */
  removeFile(input: {
    file: TrackingDocumentFile;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
};

/**
 * The viewer's Team Member id (View all scoping) and uploaders' names.
 * `TrackingDirectory` answers both; the factory adapts it.
 */
export type TrackingFilePeople = {
  memberIdOfUser(workspaceId: string, userId: string): Promise<string | null>;
  namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
};
