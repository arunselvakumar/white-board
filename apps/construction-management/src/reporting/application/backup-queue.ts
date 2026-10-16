import { DomainError } from "@/src/shared-kernel/domain-error";
import type { EventDispatcher } from "@/src/shared-kernel/events";
import type { QueueHandler, QueueJob } from "@/src/shared-kernel/queue";

import { BackupEntityWriter } from "../domain/backup-csv";
import {
  backupExpiresAt,
  backupFileName,
  backupPartKey,
  backupTitle,
  backupTooLarge,
  backupZipKey,
  BACKUP_FAILED_MESSAGE,
  BACKUP_ENTITY_MAX_CHARS,
  BACKUP_MAX_BYTES,
  BACKUP_PAGE_SIZE,
  BACKUP_TIME_LIMIT_MS,
  isUnfinished,
  MY_DATA_MODULE,
  type BackupJob,
  type BackupPart,
} from "../domain/backup-job";
import { buildBackupManifest } from "../domain/backup-manifest";
import { backupModule, isHrmsOnly } from "../domain/backup-modules";
import type { BackupFinished } from "../domain/events";
import {
  BACKUP_PART_JOB_TYPE,
  BACKUP_ZIP_JOB_TYPE,
  zipDedupeKey,
  type BackupNotify,
  type BackupPartPayload,
  type BackupZipPayload,
} from "./backup-handlers";
import type {
  BackupArchive,
  BackupArchiver,
  BackupEntityReader,
  BackupJobStore,
  BackupMailer,
  BackupNames,
  BackupStorage,
  MyDataReader,
} from "./backup-ports";

/** The daily job that expires backups and exports after 7 days. */
export const BACKUP_RETENTION_JOB_TYPE = "reporting.backup_retention";

export type BackupQueueDeps = {
  store: BackupJobStore;
  storage: BackupStorage;
  reader: BackupEntityReader;
  myData: MyDataReader;
  names: BackupNames;
  archiver: BackupArchiver;
  /** `BackupFinished` tells the requester (CM-904). */
  events?: EventDispatcher;
  mailer?: BackupMailer;
  /** The signed download path of a finished backup. */
  link(job: BackupJob): string;
  /** The absolute URL for the email. */
  absoluteUrl(path: string): string;
  /** Tests pass a small limit. */
  maxBytes?: number;
  pageSize?: number;
  timeLimitMs?: number;
  clock?: () => Date;
};

const encoder = new TextEncoder();

function notifyOf(value: unknown): BackupNotify {
  const notify = value as Partial<BackupNotify> | null | undefined;
  return {
    workspaceId:
      typeof notify?.workspaceId === "string" ? notify.workspaceId : null,
    email: typeof notify?.email === "string" ? notify.email : null,
  };
}

function partPayload(job: QueueJob): BackupPartPayload {
  const payload = job.payload as Partial<BackupPartPayload> | null;
  if (
    typeof payload?.backupJobId !== "string" ||
    typeof payload.module !== "string"
  )
    throw new Error("A backup part needs backupJobId and module.");
  return {
    backupJobId: payload.backupJobId,
    module: payload.module,
    notify: notifyOf(payload.notify),
  };
}

function zipPayload(job: QueueJob): BackupZipPayload {
  const payload = job.payload as Partial<BackupZipPayload> | null;
  if (typeof payload?.backupJobId !== "string")
    throw new Error("A backup zip needs backupJobId.");
  return { backupJobId: payload.backupJobId, notify: notifyOf(payload.notify) };
}

/** A path segment safe in every unzip tool: no slashes, controls or dots-only. */
export function zipSegment(raw: string, fallback: string): string {
  let text = "";
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0;
    text +=
      code < 0x20 || code === 0x7f || '/\\:*?"<>|'.includes(char) ? "-" : char;
  }
  text = text.trim().slice(0, 120);
  return text.length === 0 || /^\.+$/.test(text) ? fallback : text;
}

function stopIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("The backup part ran out of time.");
}

async function bytesOf(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/**
 * The backup's queue handlers (ADR CM-0021 §8): `backup.part` writes one
 * module's CSV + JSON (+ media) ZIP part; the last part enqueues
 * `backup.zip`, which writes `manifest.json` and every part into the
 * final ZIP, stores it for 7 days and tells the requester.
 */
export function createBackupQueue(deps: BackupQueueDeps) {
  const clock = deps.clock ?? (() => new Date());
  const maxBytes = deps.maxBytes ?? BACKUP_MAX_BYTES;
  const pageSize = deps.pageSize ?? BACKUP_PAGE_SIZE;
  const limit = deps.timeLimitMs ?? BACKUP_TIME_LIMIT_MS;

  async function announce(
    event: Omit<BackupFinished, "type" | "workspaceId" | "occurredAt">,
    notify: BackupNotify,
  ) {
    if (deps.events == null || notify.workspaceId == null) return;
    await deps.events.dispatch([
      {
        type: "BackupFinished",
        workspaceId: notify.workspaceId,
        occurredAt: clock(),
        ...event,
      } satisfies BackupFinished,
    ]);
  }

  async function deleteKeys(keys: readonly (string | null)[]): Promise<void> {
    for (const key of keys) {
      if (key == null) continue;
      await deps.storage.delete(key).catch((error: unknown) => {
        console.error(`Backup file ${key} could not be deleted`, error);
      });
    }
  }

  /** Marks the backup failed once, deletes its parts and tells the requester. */
  async function failBackup(
    id: string,
    message: string,
    notify: BackupNotify,
  ): Promise<void> {
    const failed = await deps.store.fail(id, message, clock());
    if (failed == null) return;
    await deleteKeys(failed.parts.map((part) => part.key));
    await announce(
      {
        backupJobId: failed.id,
        scope: failed.scope,
        projectId: failed.projectId,
        requestedBy: failed.requestedBy,
        status: "failed",
        title: backupTitle(failed.scope, failed.modules),
        fileName: null,
        downloadHref: null,
        error: message,
      },
      notify,
    );
  }

  function addText(archive: BackupArchive, path: string, text: string): void {
    archive.add(path, encoder.encode(text), true);
  }

  async function buildMyData(
    backup: BackupJob,
    archive: BackupArchive,
    part: BackupPart,
  ): Promise<BackupPart> {
    const entities = await deps.myData.read(backup.requestedBy);
    const counts: BackupPart["entities"] = [];
    let rows = 0;
    for (const entity of entities) {
      const writer = new BackupEntityWriter(entity.columns);
      writer.add(entity.rows);
      const files = writer.finish();
      addText(archive, `my-data/${entity.entity}.csv`, files.csv);
      addText(archive, `my-data/${entity.entity}.json`, files.json);
      counts.push({ entity: entity.entity, rows: writer.rows });
      rows += writer.rows;
    }
    return { ...part, rows, entities: counts, mediaFiles: 0 };
  }

  async function buildModule(
    backup: BackupJob,
    archive: BackupArchive,
    part: BackupPart,
    signal: AbortSignal,
  ): Promise<BackupPart> {
    const found = backupModule(part.module);
    if (found == null || backup.workspaceId == null)
      throw new Error(`Unknown backup module ${part.module}.`);
    const scope = {
      workspaceId: backup.workspaceId,
      // A Company backup reads every Project.
      projectId: found.scope === "project" ? backup.projectId : null,
      fromDate: backup.fromDate,
      toDate: backup.toDate,
    };
    const counts: BackupPart["entities"] = [];
    const mediaPaths = new Set<string>();
    let rows = 0;
    let mediaFiles = 0;
    for (const entity of found.entities) {
      const columns = deps.reader.columns(entity, part.money);
      const writer = new BackupEntityWriter(columns);
      let after: string | null = null;
      for (;;) {
        stopIfAborted(signal);
        const page = await deps.reader.page(entity, scope, after, pageSize);
        if (backup.includeData) {
          writer.add(page.map((row) => row.values));
          // Not exact (compression), but stops a runaway part early, and
          // always before one entity's text outgrows a JavaScript string.
          if (
            writer.approximateBytes >
            Math.min(maxBytes * 4, BACKUP_ENTITY_MAX_CHARS)
          )
            throw backupTooLarge();
        }
        if (backup.includeMedia && found.media && page.length > 0) {
          const numbers = new Map(page.map((row) => [row.id, row.number]));
          const files = await deps.reader.media(
            entity,
            scope.workspaceId,
            page.map((row) => row.id),
          );
          for (const file of files) {
            stopIfAborted(signal);
            const object = await deps.storage.get(file.fileKey);
            if (object == null) continue;
            const record = zipSegment(
              numbers.get(file.recordId) ?? file.recordId,
              file.recordId,
            );
            const base = `media/${found.folder.replace(/^masters\//, "")}/${record}/`;
            const name = zipSegment(file.fileName, "file");
            let path = `${base}${name}`;
            for (let copy = 2; mediaPaths.has(path); copy += 1)
              path = `${base}${String(copy)}-${name}`;
            mediaPaths.add(path);
            archive.add(path, await bytesOf(object.body), false);
            mediaFiles += 1;
          }
        }
        const last = page.at(-1);
        if (last == null || page.length < pageSize) break;
        after = last.id;
      }
      if (backup.includeData) {
        const files = writer.finish();
        addText(archive, `${found.folder}/${entity}.csv`, files.csv);
        addText(archive, `${found.folder}/${entity}.json`, files.json);
        counts.push({ entity, rows: writer.rows });
        rows += writer.rows;
      }
    }
    return { ...part, rows, entities: counts, mediaFiles };
  }

  const part: QueueHandler = {
    type: BACKUP_PART_JOB_TYPE,
    timeLimitMs: limit,
    async run(job, signal) {
      const payload = partPayload(job);
      const backup = await deps.store.get(payload.backupJobId);
      if (backup == null || !isUnfinished(backup)) return;
      const current = backup.parts.find((p) => p.module === payload.module);
      if (current == null) return;
      const zip = {
        type: BACKUP_ZIP_JOB_TYPE,
        workspaceId: backup.workspaceId,
        payload: {
          backupJobId: backup.id,
          notify: payload.notify,
        } satisfies BackupZipPayload,
        dedupeKey: zipDedupeKey(backup.id),
      };
      if (current.done) {
        // A retry after the part was recorded: make sure the zip is queued.
        await deps.store.completePart(backup.id, current, zip, clock());
        return;
      }
      await deps.store.markRunning(backup.id, clock());
      const key = backupPartKey(backup, payload.module);
      let built: BackupPart;
      let bytes: Uint8Array;
      try {
        const archive = deps.archiver.create(maxBytes);
        built =
          payload.module === MY_DATA_MODULE
            ? await buildMyData(backup, archive, current)
            : await buildModule(backup, archive, current, signal);
        bytes = archive.finish();
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        await failBackup(backup.id, error.message, payload.notify);
        return;
      }
      await deps.storage.put(key, bytes, "application/zip");
      const recorded = await deps.store.completePart(
        backup.id,
        { ...built, key, bytes: bytes.byteLength, done: true },
        zip,
        clock(),
      );
      if (recorded == null) await deleteKeys([key]);
    },
    async onGiveUp(job) {
      const payload = partPayload(job);
      await failBackup(
        payload.backupJobId,
        BACKUP_FAILED_MESSAGE,
        payload.notify,
      );
    },
  };

  async function zipBackup(
    backup: BackupJob,
    notify: BackupNotify,
  ): Promise<void> {
    if (backup.parts.some((p) => !p.done || p.key == null))
      throw new Error("The backup's parts are not all written yet.");
    const partBytes = backup.parts.reduce((sum, p) => sum + p.bytes, 0);
    if (partBytes > maxBytes) throw backupTooLarge();
    const [companyName, projectName, requesterName] = await Promise.all([
      backup.workspaceId == null
        ? Promise.resolve(null)
        : deps.names.company(backup.workspaceId),
      backup.workspaceId == null || backup.projectId == null
        ? Promise.resolve(null)
        : deps.names.project(backup.workspaceId, backup.projectId),
      deps.names.user(backup.requestedBy),
    ]);
    const now = clock();
    const archive = deps.archiver.create(maxBytes);
    const manifest = buildBackupManifest({
      job: backup,
      parts: backup.parts,
      companyName,
      projectName,
      requesterName,
      generatedAt: now,
    });
    addText(archive, "manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
    for (const p of backup.parts) {
      const object = await deps.storage.get(p.key ?? "");
      if (object == null)
        throw new Error(`The backup part ${p.module} is missing from storage.`);
      await deps.archiver.copyEntries(object, archive);
    }
    const bytes = archive.finish();
    const key = backupZipKey(backup);
    const fileName = backupFileName(
      backup.scope,
      now.toISOString().slice(0, 10),
      backup.modules,
    );
    await deps.storage.put(key, bytes, "application/zip");
    const finishedAt = clock();
    const expiresAt = backupExpiresAt(finishedAt);
    const finished = await deps.store.finish(backup.id, {
      fileKey: key,
      fileName,
      bytes: bytes.byteLength,
      finishedAt,
      expiresAt,
    });
    if (!finished) {
      await deleteKeys([key]);
      return;
    }
    await deleteKeys(backup.parts.map((p) => p.key));
    const done: BackupJob = {
      ...backup,
      status: "done",
      fileKey: key,
      fileName,
      bytes: bytes.byteLength,
      finishedAt,
      expiresAt,
    };
    const href = deps.link(done);
    await announce(
      {
        backupJobId: backup.id,
        scope: backup.scope,
        projectId: backup.projectId,
        requestedBy: backup.requestedBy,
        status: "done",
        title: backupTitle(backup.scope, backup.modules),
        fileName,
        downloadHref: href,
        error: null,
      },
      notify,
    );
    if (
      backup.scope === "company" &&
      backup.workspaceId != null &&
      !isHrmsOnly(backup.modules) &&
      notify.email != null &&
      deps.mailer != null
    )
      await deps.mailer
        .sendCompanyBackupReady({
          workspaceId: backup.workspaceId,
          to: notify.email,
          companyName: companyName ?? "your Company",
          downloadUrl: deps.absoluteUrl(href),
          expiresAt,
          fileName,
        })
        .catch((error: unknown) => {
          console.error(`Backup ${backup.id} email failed`, error);
        });
  }

  const zip: QueueHandler = {
    type: BACKUP_ZIP_JOB_TYPE,
    timeLimitMs: limit,
    async run(job) {
      const payload = zipPayload(job);
      const backup = await deps.store.get(payload.backupJobId);
      if (backup == null || !isUnfinished(backup)) return;
      try {
        await zipBackup(backup, payload.notify);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        await failBackup(backup.id, error.message, payload.notify);
      }
    },
    async onGiveUp(job) {
      const payload = zipPayload(job);
      await failBackup(
        payload.backupJobId,
        BACKUP_FAILED_MESSAGE,
        payload.notify,
      );
    },
  };

  const retention: QueueHandler = {
    type: BACKUP_RETENTION_JOB_TYPE,
    timeLimitMs: 240_000,
    async run(_job, signal) {
      await expireBackups(signal);
    },
  };

  /** Expires every done backup past its 7 days: file deleted, row `expired`. */
  async function expireBackups(signal?: AbortSignal): Promise<string[]> {
    const now = clock();
    const expired: string[] = [];
    while (signal?.aborted !== true && expired.length < 2000) {
      const jobs = await deps.store.expirable(now, 100);
      let changed = 0;
      for (const job of jobs) {
        if (!(await deps.store.markExpired(job, now))) continue;
        changed += 1;
        expired.push(job.id);
        await deleteKeys([job.fileKey, ...job.parts.map((p) => p.key)]);
      }
      if (jobs.length < 100 || changed === 0) break;
    }
    return expired;
  }

  return { part, zip, retention, expireBackups };
}

export type BackupQueue = ReturnType<typeof createBackupQueue>;
