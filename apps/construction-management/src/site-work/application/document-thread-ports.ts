import type { AuditEvent } from "@/src/shared-kernel/audit";
import type { NewStoredFile } from "@/src/shared-kernel/files";

import type {
  LocatedSiteWorkDocument,
  SiteWorkDocumentFile,
  SiteWorkRemark,
} from "../domain/document-thread";
import type { SiteWorkDocumentType } from "../domain/site-work-documents";

/**
 * Ports of the site-work document thread (CM-0016 §8). They live beside
 * the thread rather than in `ports.ts`, which the sheet tickets extend.
 */

/** Finds a live document of the Company in its own table. */
export type SiteWorkDocumentLocator = {
  locate(
    workspaceId: string,
    type: SiteWorkDocumentType,
    id: string,
  ): Promise<LocatedSiteWorkDocument | null>;
};

/** A file as stored, `deletedAt` set once it was removed (its key stays taken). */
export type StoredSiteWorkDocumentFile = SiteWorkDocumentFile & {
  deletedAt: Date | null;
};

/**
 * `construction_site_work.remarks` and `document_files`. Every write is one
 * transaction that first locks the document's row, so a document deleted
 * meanwhile gets nothing new (404 `<DOCUMENT>_NOT_FOUND`).
 */
export type SiteWorkDocumentThreadStore = {
  /** Oldest first. */
  remarks(
    workspaceId: string,
    type: SiteWorkDocumentType,
    documentId: string,
  ): Promise<SiteWorkRemark[]>;
  /** Live files, oldest first, remarks' files included. */
  files(
    workspaceId: string,
    type: SiteWorkDocumentType,
    documentId: string,
  ): Promise<SiteWorkDocumentFile[]>;
  countFiles(
    workspaceId: string,
    type: SiteWorkDocumentType,
    documentId: string,
  ): Promise<number>;
  /** A live file of the document, or null. */
  file(
    workspaceId: string,
    type: SiteWorkDocumentType,
    documentId: string,
    fileId: string,
  ): Promise<SiteWorkDocumentFile | null>;
  /** The file at this key, live or removed, or null. */
  fileByKey(
    workspaceId: string,
    type: SiteWorkDocumentType,
    documentId: string,
    key: string,
  ): Promise<StoredSiteWorkDocumentFile | null>;
  /**
   * Inserts the remark and attaches `fileIds` to it: each must be a live
   * file of the document, on no remark yet, uploaded by the remark's
   * author (400 `DOCUMENT_FILE_NOT_FOUND` otherwise). Returns the files.
   */
  addRemark(input: {
    document: LocatedSiteWorkDocument;
    remark: SiteWorkRemark;
    fileIds: readonly string[];
    audit: AuditEvent;
  }): Promise<SiteWorkDocumentFile[]>;
  /**
   * Inserts the file with its `stored_files` rows and audit event: 409
   * `DOCUMENT_FILES_LIMIT` at `maxFiles` live files; `duplicate` when a
   * row already has this key (a retried completion won the race).
   */
  addFile(input: {
    document: LocatedSiteWorkDocument;
    file: SiteWorkDocumentFile;
    storedFiles: readonly NewStoredFile[];
    audit: AuditEvent;
    maxFiles: number;
  }): Promise<"added" | "duplicate">;
  /** Tombstones the file and stops counting its bytes; false when already gone. */
  removeFile(input: {
    file: SiteWorkDocumentFile;
    by: string;
    now: Date;
    audit: AuditEvent;
  }): Promise<boolean>;
};

/**
 * Names of the people behind User ids: the Company's Team Members, the
 * Owner included; a removed Team Member's name still says who wrote.
 * `src/composition/site-work-people.ts` implements it (organization).
 */
export type SiteWorkAuthorNames = {
  namesOf(
    workspaceId: string,
    userIds: readonly string[],
  ): Promise<Map<string, string>>;
};
