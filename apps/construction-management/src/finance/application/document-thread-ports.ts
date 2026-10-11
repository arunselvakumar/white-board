import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { NewStoredFile } from "@/src/shared-kernel/files";

import type {
  FinanceDocumentFile,
  FinanceDocumentType,
  FinanceRemark,
  LocatedFinanceDocument,
} from "../domain/finance-documents";

/**
 * Ports of the finance document thread (remarks and files, ADR CM-0017).
 * They live beside the thread rather than in `ports.ts`, which every M7
 * ticket extends.
 */

/** Finds a live document of the Company in its own table. */
export type FinanceDocumentLocator = {
  locate(
    workspaceId: string,
    type: FinanceDocumentType,
    id: string,
  ): Promise<LocatedFinanceDocument | null>;
};

/** A file as stored, `deletedAt` set once it was removed (its key stays taken). */
export type StoredFinanceDocumentFile = FinanceDocumentFile & {
  deletedAt: Date | null;
};

/**
 * `construction_finance.remarks` and `document_files`. Every write is one
 * transaction that first locks the document's row, so a document deleted
 * meanwhile gets nothing new (404 `<DOCUMENT>_NOT_FOUND`).
 */
export type FinanceDocumentThreadStore = {
  /** Oldest first. */
  remarks(
    workspaceId: string,
    type: FinanceDocumentType,
    documentId: string,
  ): Promise<FinanceRemark[]>;
  /** Live files, oldest first, remarks' files included. */
  files(
    workspaceId: string,
    type: FinanceDocumentType,
    documentId: string,
  ): Promise<FinanceDocumentFile[]>;
  countFiles(
    workspaceId: string,
    type: FinanceDocumentType,
    documentId: string,
  ): Promise<number>;
  /** A live file of the document, or null. */
  file(
    workspaceId: string,
    type: FinanceDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<FinanceDocumentFile | null>;
  /** The file at this key, live or removed, or null. */
  fileByKey(
    workspaceId: string,
    type: FinanceDocumentType,
    documentId: string,
    key: string,
  ): Promise<StoredFinanceDocumentFile | null>;
  /**
   * Inserts the remark and attaches `fileIds` to it: each must be a live
   * file of the document, on no remark yet, uploaded by the remark's
   * author (400 `DOCUMENT_FILE_NOT_FOUND` otherwise). Returns the files.
   */
  addRemark(input: {
    document: LocatedFinanceDocument;
    remark: FinanceRemark;
    fileIds: readonly string[];
    audit: AuditEvent;
  }): Promise<FinanceDocumentFile[]>;
  /**
   * Inserts the file with its `stored_files` rows and audit event: 409
   * `DOCUMENT_FILES_LIMIT` at `maxFiles` live files; `duplicate` when a
   * row already has this key (a retried completion won the race).
   */
  addFile(input: {
    document: LocatedFinanceDocument;
    file: FinanceDocumentFile;
    storedFiles: readonly NewStoredFile[];
    audit: AuditEvent;
    maxFiles: number;
  }): Promise<"added" | "duplicate">;
  /** Tombstones the file and stops counting its bytes; false when already gone. */
  removeFile(input: {
    file: FinanceDocumentFile;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
};

/**
 * Names of the people behind User ids: the Company's Team Members, the
 * Owner included; a removed Team Member's name still says who wrote.
 * `src/composition/finance-author-names.ts` implements it (organization).
 */
export type FinanceAuthorNames = {
  namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};
