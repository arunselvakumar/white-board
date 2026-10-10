import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { NewStoredFile } from "@/src/shared-kernel/files";

import type {
  DocumentFile,
  DocumentRemark,
  LocatedDocument,
} from "../domain/document-thread";
import type { ProcurementDocumentType } from "../domain/documents";

/** Finds a live document of the Company in its own table. */
export type DocumentLocator = {
  locate(
    workspaceId: string,
    type: ProcurementDocumentType,
    id: string,
  ): Promise<LocatedDocument | null>;
};

/** A file as stored, `deletedAt` set once it was removed (its key stays taken). */
export type StoredDocumentFile = DocumentFile & { deletedAt: Date | null };

/**
 * `construction_procurement.remarks` and `document_files`. Every write is
 * one transaction that first locks the document's row, so a document
 * deleted meanwhile gets nothing new (404 `<DOCUMENT>_NOT_FOUND`).
 */
export type DocumentThreadStore = {
  /** Oldest first. */
  remarks(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
  ): Promise<DocumentRemark[]>;
  /** Live files, oldest first, remarks' files included. */
  files(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
  ): Promise<DocumentFile[]>;
  countFiles(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
  ): Promise<number>;
  /** A live file of the document, or null. */
  file(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<DocumentFile | null>;
  /** The file at this key, live or removed, or null. */
  fileByKey(
    workspaceId: string,
    type: ProcurementDocumentType,
    documentId: string,
    key: string,
  ): Promise<StoredDocumentFile | null>;
  /**
   * Inserts the remark and attaches `fileIds` to it: each must be a live
   * file of the document, on no remark yet, uploaded by the remark's
   * author (400 `DOCUMENT_FILE_NOT_FOUND` otherwise). Returns the files.
   */
  addRemark(input: {
    document: LocatedDocument;
    remark: DocumentRemark;
    fileIds: readonly string[];
    audit: AuditEvent;
  }): Promise<DocumentFile[]>;
  /**
   * Inserts the file with its `stored_files` rows and audit event: 409
   * `DOCUMENT_FILES_LIMIT` at `maxFiles` live files; `duplicate` when a
   * row already has this key (a retried completion won the race).
   */
  addFile(input: {
    document: LocatedDocument;
    file: DocumentFile;
    storedFiles: readonly NewStoredFile[];
    audit: AuditEvent;
    maxFiles: number;
  }): Promise<"added" | "duplicate">;
  /** Tombstones the file and stops counting its bytes; false when already gone. */
  removeFile(input: {
    file: DocumentFile;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
};

/**
 * Names of the people behind User ids: the Company's Team Members, the
 * Owner included. A removed Team Member's name still says who wrote.
 */
export type AuthorNames = {
  namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};
