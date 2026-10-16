import { isCalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { EnqueueInput } from "@/src/shared-kernel/queue";

import {
  emptyPart,
  isUnfinished,
  MAX_UNFINISHED_BACKUPS,
  MY_DATA_MODULE,
  type BackupJob,
  type BackupScope,
} from "../domain/backup-job";
import type { AllowedModules } from "./backup-access";
import type { BackupJobStore, BackupStorage } from "./backup-ports";

/** Queue job types of a backup (ADR CM-0021 §1, §8). */
export const BACKUP_PART_JOB_TYPE = "backup.part";
export const BACKUP_ZIP_JOB_TYPE = "backup.zip";

/** Where a finished backup tells its requester (see `BackupFinished`). */
export type BackupNotify = {
  /** The Company the notification lands in; null when there is none. */
  workspaceId: string | null;
  /** Emailed the link (a full Company backup's Owner); null for no email. */
  email: string | null;
};

export type BackupPartPayload = {
  backupJobId: string;
  module: string;
  notify: BackupNotify;
};

export type BackupZipPayload = { backupJobId: string; notify: BackupNotify };

export function partDedupeKey(backupId: string, module: string): string {
  return `backup.part:${backupId}:${module}`;
}

export function zipDedupeKey(backupId: string): string {
  return `backup.zip:${backupId}`;
}

export type BackupRequest = {
  workspaceId: string | null;
  projectId: string | null;
  scope: BackupScope;
  /** Allowed modules with their money right; empty for My Data. */
  modules: AllowedModules;
  fromDate: string | null;
  toDate: string | null;
  includeData: boolean;
  includeMedia: boolean;
  requestedBy: string;
  notify: BackupNotify;
};

function checkRange(fromDate: string | null, toDate: string | null): void {
  for (const date of [fromDate, toDate])
    if (date != null && !isCalendarDate(date))
      throw new DomainError("BACKUP_RANGE_INVALID", "Enter real dates.");
  if (fromDate != null && toDate != null && fromDate > toDate)
    throw new DomainError(
      "BACKUP_RANGE_INVALID",
      "The From date must be on or before the To date.",
    );
}

/**
 * Requesting, reading and deleting backups (ADR CM-0021 §8). The access
 * checks are made before `request` (`backup-access.ts` and the routes);
 * the queue handlers in `backup-queue.ts` do the work.
 */
export class BackupHandlers {
  constructor(
    private readonly deps: {
      store: BackupJobStore;
      storage: BackupStorage;
      clock?: () => Date;
    },
  ) {}

  private now(): Date {
    return (this.deps.clock ?? (() => new Date()))();
  }

  /**
   * Inserts the job `queued` with one part per module, and one queue job
   * per part in the same transaction. 400 without data or media or for a
   * bad range; 409 `TOO_MANY_BACKUPS` past three unfinished.
   */
  async request(
    input: BackupRequest,
  ): Promise<{ job: BackupJob; queueIds: string[] }> {
    if (!input.includeData && !input.includeMedia)
      throw new DomainError(
        "BACKUP_CONTENT_REQUIRED",
        "Choose Data, Media or both.",
      );
    checkRange(input.fromDate, input.toDate);
    if (
      (await this.deps.store.countUnfinished(input.requestedBy)) >=
      MAX_UNFINISHED_BACKUPS
    )
      throw conflict(
        "TOO_MANY_BACKUPS",
        "Wait for one of your backups to finish.",
      );
    const now = this.now();
    const parts =
      input.scope === "my_data"
        ? [emptyPart(MY_DATA_MODULE, false)]
        : input.modules.map(({ module, money }) =>
            emptyPart(module.key, money),
          );
    const job: BackupJob = {
      id: newId(now.getTime()),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      scope: input.scope,
      modules: input.modules.map(({ module }) => module.key),
      fromDate: input.fromDate,
      toDate: input.toDate,
      includeData: input.scope === "my_data" ? true : input.includeData,
      includeMedia: input.scope === "my_data" ? false : input.includeMedia,
      includesMoney: parts.some((part) => part.money),
      status: "queued",
      parts,
      fileKey: null,
      fileName: null,
      bytes: null,
      error: null,
      requestedBy: input.requestedBy,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      expiresAt: null,
    };
    const queue: EnqueueInput[] = parts.map((part) => ({
      type: BACKUP_PART_JOB_TYPE,
      workspaceId: input.workspaceId,
      payload: {
        backupJobId: job.id,
        module: part.module,
        notify: input.notify,
      } satisfies BackupPartPayload,
      dedupeKey: partDedupeKey(job.id, part.module),
    }));
    const queueIds = await this.deps.store.create(job, queue);
    return { job, queueIds };
  }

  /** The requester's backup; anyone else's is 404. */
  async getOwn(id: string, userId: string): Promise<BackupJob> {
    const job = await this.deps.store.get(id);
    if (job?.requestedBy !== userId)
      throw notFound("BACKUP_NOT_FOUND", "There is no such backup.");
    return job;
  }

  listOwn(
    userId: string,
    workspaceId: string | null,
    page: Parameters<BackupJobStore["listOwn"]>[2],
  ): Promise<BackupJob[]> {
    return this.deps.store.listOwn(userId, workspaceId, page);
  }

  /** Deletes the requester's backup with its ZIP and parts. */
  async delete(id: string, userId: string): Promise<void> {
    const job = await this.getOwn(id, userId);
    await this.deps.store.delete(job, this.now());
    const keys = [job.fileKey, ...job.parts.map((part) => part.key)].filter(
      (key): key is string => key != null,
    );
    for (const key of keys)
      await this.deps.storage.delete(key).catch((error: unknown) => {
        console.error(`Backup file ${key} could not be deleted`, error);
      });
  }

  /** Queue jobs to nudge for these backups (only while they are unfinished). */
  stalled(jobs: readonly BackupJob[]): Promise<string[]> {
    const ids = jobs.filter(isUnfinished).map((job) => job.id);
    if (ids.length === 0) return Promise.resolve([]);
    return this.deps.store.stalledQueueJobs(ids, this.now());
  }
}
