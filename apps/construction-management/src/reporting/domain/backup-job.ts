import { DomainError } from "@/src/shared-kernel/domain-error";

import { isHrmsOnly } from "./backup-modules";

/**
 * Backups and data exports (ADR CM-0021 §8, CM-906): a ZIP of one CSV and
 * one JSON file per entity of the chosen modules, with a `manifest.json`
 * and, when asked, the modules' files under `media/`. A job runs as one
 * queue job per module ("part"), then a zip step.
 */

export const BACKUP_SCOPES = [
  "project",
  "masters",
  "company",
  "my_data",
] as const;

export type BackupScope = (typeof BACKUP_SCOPES)[number];

export type BackupStatus = "queued" | "running" | "done" | "failed" | "expired";

/** One module's part, as recorded in `backup_jobs.parts`. */
export type BackupPart = {
  /** A backup module key (`backup-modules.ts`), or `my_data`. */
  module: string;
  /** Its object in storage while it exists; null before it is written. */
  key: string | null;
  /** Rows written, every entity together. */
  rows: number;
  bytes: number;
  done: boolean;
  /** Its CSVs carry amounts (the requester's money right on the module). */
  money: boolean;
  /** Rows per entity, for the manifest. */
  entities: { entity: string; rows: number }[];
  /** Files added under `media/`. */
  mediaFiles: number;
};

export type BackupJob = {
  id: string;
  /** Null for Download My Data, which spans Companies. */
  workspaceId: string | null;
  projectId: string | null;
  scope: BackupScope;
  modules: string[];
  /** Inclusive, `YYYY-MM-DD`; null for all time. */
  fromDate: string | null;
  toDate: string | null;
  includeData: boolean;
  includeMedia: boolean;
  /** At least one part carries amounts. */
  includesMoney: boolean;
  status: BackupStatus;
  parts: BackupPart[];
  fileKey: string | null;
  fileName: string | null;
  bytes: number | null;
  error: string | null;
  requestedBy: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  expiresAt: Date | null;
};

/** The single part of Download My Data. */
export const MY_DATA_MODULE = "my_data";

/** The `stored_files` kind of a backup's ZIP and parts: not counted as storage. */
export const BACKUP_FILE_KIND = "backup";

/** A finished backup's link works, and its file is kept, this long. */
export const BACKUP_RETENTION_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function backupExpiresAt(finishedAt: Date): Date {
  return new Date(finishedAt.getTime() + BACKUP_RETENTION_DAYS * DAY_MS);
}

/** The largest backup we make (ADR CM-0021 §8): 2 GB. */
export const BACKUP_MAX_BYTES = 2_000_000_000;

/** Each part and the zip step must finish inside the queue's 240 s. */
export const BACKUP_TIME_LIMIT_MS = 240_000;

/** Rows read per page, so a large table never sits in memory at once. */
export const BACKUP_PAGE_SIZE = 1000;

/** A requester may have this many backups queued or running at once. */
export const MAX_UNFINISHED_BACKUPS = 3;

export const BACKUP_TOO_LARGE_MESSAGE =
  "Too large — choose fewer modules or a shorter range";

export function backupTooLarge(): DomainError {
  return new DomainError("BACKUP_TOO_LARGE", BACKUP_TOO_LARGE_MESSAGE, {
    kind: "conflict",
  });
}

export const BACKUP_FAILED_MESSAGE = "The backup could not be made. Try again.";

export function isUnfinished(job: Pick<BackupJob, "status">): boolean {
  return job.status === "queued" || job.status === "running";
}

/**
 * What a backup is called on Downloads, in notifications and emails. A
 * Company-scope backup of HRMS modules alone (Settings → Backup & export)
 * is an "HRMS backup".
 */
export function backupTitle(
  scope: BackupScope,
  modules: readonly string[] = [],
): string {
  switch (scope) {
    case "project":
      return "Project backup";
    case "masters":
      return "Master records backup";
    case "company":
      return isHrmsOnly(modules) ? "HRMS backup" : "Full Company backup";
    case "my_data":
      return "My data";
  }
}

const DAY = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `01 Sep 2026`, from `2026-09-01`. */
export function backupDayLabel(date: string): string {
  return DAY.format(new Date(`${date}T00:00:00Z`));
}

/** "All dates", "From 01 Sep 2026", "01 Sep 2026 to 30 Sep 2026". */
export function backupRangeLabel(
  job: Pick<BackupJob, "fromDate" | "toDate">,
): string {
  if (job.fromDate == null && job.toDate == null) return "All dates";
  if (job.toDate == null) return `From ${backupDayLabel(job.fromDate ?? "")}`;
  if (job.fromDate == null) return `Up to ${backupDayLabel(job.toDate)}`;
  return `${backupDayLabel(job.fromDate)} to ${backupDayLabel(job.toDate)}`;
}

/** What a row of Downloads says it covers. */
export function backupDetail(
  job: Pick<BackupJob, "scope" | "modules" | "fromDate" | "toDate">,
): string {
  if (job.scope === "my_data") return "Your profile, Companies and activity";
  const count = job.modules.length;
  const modules = `${String(count)} ${count === 1 ? "module" : "modules"}`;
  if (job.scope === "company")
    return isHrmsOnly(job.modules)
      ? `${modules} of HRMS`
      : "Every Project, master records, HRMS and settings";
  return job.scope === "project"
    ? `${modules} · ${backupRangeLabel(job)}`
    : modules;
}

/** `project-backup-2026-10-16.zip`, from the scope and the day it finished. */
export function backupFileName(
  scope: BackupScope,
  finishedOn: string,
  modules: readonly string[] = [],
): string {
  const stem =
    scope === "my_data"
      ? "my-data"
      : scope === "company" && isHrmsOnly(modules)
        ? "hrms-backup"
        : `${scope.replace("_", "-")}-backup`;
  return `${stem}-${finishedOn}.zip`;
}

/** Where a backup's objects live: under the Company, or the User for My Data. */
export function backupFolder(
  job: Pick<BackupJob, "id" | "workspaceId" | "requestedBy">,
): string {
  return job.workspaceId == null
    ? `users/${job.requestedBy}/exports/${job.id}`
    : `companies/${job.workspaceId}/backups/${job.id}`;
}

/** A part's object key. */
export function backupPartKey(
  job: Pick<BackupJob, "id" | "workspaceId" | "requestedBy">,
  module: string,
): string {
  return `${backupFolder(job)}/parts/${module.replace(/[^a-z0-9_-]/gi, "-")}.zip`;
}

/** The finished ZIP's object key. */
export function backupZipKey(
  job: Pick<BackupJob, "id" | "workspaceId" | "requestedBy">,
): string {
  return `${backupFolder(job)}/backup.zip`;
}

/** A new part, before it runs. */
export function emptyPart(module: string, money: boolean): BackupPart {
  return {
    module,
    key: null,
    rows: 0,
    bytes: 0,
    done: false,
    money,
    entities: [],
    mediaFiles: 0,
  };
}
