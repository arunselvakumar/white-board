import {
  constructionMessaging,
  constructionOrigin,
} from "@repo/auth/construction/server";
import { prisma } from "@repo/construction-db";
import { renderBackupReadyEmail } from "@repo/email-templates";

import {
  createBackupEntityReader,
  createMyDataReader,
  backupNames,
} from "@/src/composition/backup-sources";
import { messagingEvents } from "@/src/composition/messaging";
import { kickQueue } from "@/src/composition/queue";
import {
  BackupHandlers,
  type BackupRequest,
  zipDedupeKey,
} from "@/src/reporting/application/backup-handlers";
import type {
  BackupEntityReader,
  BackupMailer,
  MyDataReader,
} from "@/src/reporting/application/backup-ports";
import { createBackupQueue } from "@/src/reporting/application/backup-queue";
import type { BackupJob } from "@/src/reporting/domain/backup-job";
import { signedBackupPath } from "@/src/reporting/domain/backup-link";
import { prismaBackupJobStore } from "@/src/reporting/infrastructure/prisma-backup-job-store";
import { fflateArchiver } from "@/src/reporting/infrastructure/zip-archiver";
import { companyTimezone } from "@/src/shared-kernel/company-today";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { QueueHandler } from "@/src/shared-kernel/queue";

/**
 * Backups and Download My Data wired to Prisma, storage, messaging and
 * email (CM-906, ADR CM-0021 §8). Reporting's handlers cannot read other
 * contexts; the readers in `backup-sources.ts` can.
 */

export const BACKUPS_PATH = "/api/construction/reporting/backups";

/** The key that signs backup links: the app's auth secret. */
export function backupLinkSecret(): string {
  const value = process.env["BETTER_AUTH_SECRET"];
  if (value != null && value.length > 0) return value;
  if (process.env.NODE_ENV === "production")
    throw new Error("BETTER_AUTH_SECRET is required in production.");
  return "construction-development-backup-link-secret";
}

/** A finished backup's signed download path (null until it is done). */
export function backupDownloadPath(job: BackupJob): string | null {
  if (job.status !== "done" || job.expiresAt == null) return null;
  return signedBackupPath(backupLinkSecret(), BACKUPS_PATH, {
    backupId: job.id,
    requestedBy: job.requestedBy,
    expires: Math.floor(job.expiresAt.getTime() / 1000),
  });
}

const emailMailer: BackupMailer = {
  async sendCompanyBackupReady(input) {
    const rendered = await renderBackupReadyEmail({
      companyName: input.companyName,
      downloadUrl: input.downloadUrl,
      fileName: input.fileName,
      // The link's last day on the Company's own calendar.
      expiresOn: new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: await companyTimezone(prisma, input.workspaceId),
      }).format(input.expiresAt),
    });
    await constructionMessaging.sendEmail({ to: input.to, ...rendered });
  },
};

export type BackupJobsOptions = {
  /** Tests inject a small limit for the too-large path. */
  maxBytes?: number;
  pageSize?: number;
  clock?: () => Date;
  reader?: BackupEntityReader;
  myData?: MyDataReader;
};

const store = prismaBackupJobStore(prisma);

function queueFor(options: BackupJobsOptions) {
  return createBackupQueue({
    store,
    storage: objectStorage(),
    reader: options.reader ?? createBackupEntityReader(),
    myData: options.myData ?? createMyDataReader(),
    names: backupNames,
    archiver: fflateArchiver,
    events: messagingEvents(),
    mailer: emailMailer,
    link: (job) => backupDownloadPath(job) ?? "",
    absoluteUrl: (path) => `${constructionOrigin()}${path}`,
    maxBytes: options.maxBytes,
    pageSize: options.pageSize,
    clock: options.clock,
  });
}

/** `backup.part`, `backup.zip` and the daily `reporting.backup_retention`. */
export function backupQueueHandlersFromEnv(): QueueHandler[] {
  const queue = queueFor({});
  return [queue.part, queue.zip, queue.retention];
}

/** The zip job a finished last part queued, if any (by its dedupe key). */
async function queuedZipJob(backupId: string): Promise<string | null> {
  const row = await prisma.constructionOrganizationQueueJob.findFirst({
    where: { dedupeKey: zipDedupeKey(backupId), status: "queued" },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * Backup handlers for the routes. Requests go on the queue and drain
 * after the response; outside a request (HTTP tests) the parts run before
 * `request` returns, then the zip they queued, so a test sees it done.
 */
export function createBackupJobs(options: BackupJobsOptions = {}) {
  const queue = queueFor(options);
  const handlers = new BackupHandlers({
    store,
    storage: objectStorage(),
    clock: options.clock,
  });
  const own: QueueHandler[] = [queue.part, queue.zip];

  async function kick(backupId: string, ids: readonly string[]) {
    if (ids.length > 0) await kickQueue(ids, own);
    // In a request nothing has run yet, so there is no zip job to find.
    const zip = await queuedZipJob(backupId);
    if (zip != null) await kickQueue([zip], own);
  }

  /** A polling read nudges stuck parts or a stuck zip (ADR CM-0021 §1). */
  async function heal(jobs: readonly BackupJob[]): Promise<void> {
    const ids = await handlers.stalled(jobs);
    if (ids.length > 0) await kickQueue(ids, own);
  }

  return {
    handlers,
    queue,
    heal,
    async request(input: BackupRequest): Promise<BackupJob> {
      const { job, queueIds } = await handlers.request(input);
      await kick(job.id, queueIds);
      return (await store.get(job.id)) ?? job;
    },
    /** Any backup by id, for the signed link (which checks who may open it). */
    get(id: string): Promise<BackupJob | null> {
      return store.get(id);
    },
    async getOwn(id: string, userId: string): Promise<BackupJob> {
      const job = await handlers.getOwn(id, userId);
      await heal([job]);
      return (await store.get(id)) ?? job;
    },
  };
}

export type BackupJobs = ReturnType<typeof createBackupJobs>;
