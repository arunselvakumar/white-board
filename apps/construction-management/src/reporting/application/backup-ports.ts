import type { StoredObject } from "@/src/shared-kernel/files";
import type { EnqueueInput } from "@/src/shared-kernel/queue";

import type { BackupColumn, BackupRawValue } from "../domain/backup-csv";
import type { BackupJob, BackupPart } from "../domain/backup-job";

/** Where backup jobs live (`construction_reporting.backup_jobs`). */
export type BackupJobStore = {
  /** Inserts the job and its part jobs in one transaction; the queue ids. */
  create(job: BackupJob, parts: readonly EnqueueInput[]): Promise<string[]>;
  get(id: string): Promise<BackupJob | null>;
  /**
   * The User's own backups, newest first by `createdAt` then `id`, before
   * `before`: those asked in `workspaceId`, and their data exports.
   */
  listOwn(
    userId: string,
    workspaceId: string | null,
    page: { before: { createdAt: Date; id: string } | null; limit: number },
  ): Promise<BackupJob[]>;
  countUnfinished(userId: string): Promise<number>;
  /** queued → running (keeps `startedAt` once set); false when not unfinished. */
  markRunning(id: string, now: Date): Promise<boolean>;
  /**
   * Records a finished part (and its `stored_files` row when the backup
   * belongs to a Company) in one statement, so parallel parts never lose
   * each other's. When it was the last part, enqueues `zip` in the same
   * transaction. Null when the backup is gone or no longer running.
   */
  completePart(
    id: string,
    part: BackupPart,
    zip: EnqueueInput,
    now: Date,
  ): Promise<{ allDone: boolean; zipQueueId: string | null } | null>;
  /**
   * running → done with its ZIP (recorded as a stored file when the
   * backup belongs to a Company), the parts' files no longer counted;
   * false when it was no longer running.
   */
  finish(
    id: string,
    done: {
      fileKey: string;
      fileName: string;
      bytes: number;
      finishedAt: Date;
      expiresAt: Date;
    },
  ): Promise<boolean>;
  /** queued | running → failed; the job when it changed, else null. */
  fail(id: string, error: string, now: Date): Promise<BackupJob | null>;
  /** Deletes the row and stops counting its files (they are not counted anyway). */
  delete(job: BackupJob, now: Date): Promise<void>;
  /** Done jobs whose link has passed `now`, oldest first. */
  expirable(now: Date, limit: number): Promise<BackupJob[]>;
  /** done → expired, file key cleared, stored files deleted; false when changed meanwhile. */
  markExpired(job: BackupJob, now: Date): Promise<boolean>;
  /**
   * The queue jobs of these backups a polling screen should nudge: queued
   * and due for more than 15 s, or running past their lease.
   */
  stalledQueueJobs(backupIds: readonly string[], now: Date): Promise<string[]>;
};

/** Where a part's rows come from for one Company and Project. */
export type BackupReadScope = {
  workspaceId: string;
  /** Null: every Project (a full Company backup) or a Company-level entity. */
  projectId: string | null;
  fromDate: string | null;
  toDate: string | null;
};

export type BackupRow = {
  id: string;
  /** The record's number, for the media folder; null when it has none. */
  number: string | null;
  values: Record<string, BackupRawValue>;
};

export type BackupMediaFile = {
  recordId: string;
  fileKey: string;
  fileName: string;
};

/**
 * Plain reads of each entity's table (the composition root, across
 * contexts): tombstoned rows left out, the range on the entity's own
 * date, a page at a time by id.
 */
export type BackupEntityReader = {
  /** Columns in file order; money columns left out without `money`. */
  columns(entity: string, money: boolean): BackupColumn[];
  page(
    entity: string,
    scope: BackupReadScope,
    after: string | null,
    limit: number,
  ): Promise<BackupRow[]>;
  /** The stored files of these records, for "Media". */
  media(
    entity: string,
    workspaceId: string,
    recordIds: readonly string[],
  ): Promise<BackupMediaFile[]>;
};

/** One file of Download My Data. */
export type MyDataEntity = {
  entity: string;
  columns: BackupColumn[];
  rows: Record<string, BackupRawValue>[];
};

/** A User's own data across Companies (Download My Data). */
export type MyDataReader = {
  read(userId: string): Promise<MyDataEntity[]>;
};

/** Names for the manifest. */
export type BackupNames = {
  company(workspaceId: string): Promise<string | null>;
  project(workspaceId: string, projectId: string): Promise<string | null>;
  user(userId: string): Promise<string | null>;
};

/** A ZIP being written; `add` throws `BACKUP_TOO_LARGE` past the limit. */
export type BackupArchive = {
  add(path: string, data: Uint8Array, compress: boolean): void;
  /** Bytes of ZIP written so far. */
  readonly bytes: number;
  finish(): Uint8Array;
};

export type BackupArchiver = {
  create(maxBytes: number): BackupArchive;
  /** Copies every entry of a stored part into `into`, streaming it. */
  copyEntries(part: StoredObject, into: BackupArchive): Promise<number>;
};

export type BackupStorage = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
};

/** The Owner's email with a full Company backup's link. */
export type BackupMailer = {
  sendCompanyBackupReady(input: {
    to: string;
    companyName: string;
    downloadUrl: string;
    expiresAt: Date;
    fileName: string;
  }): Promise<void>;
};
