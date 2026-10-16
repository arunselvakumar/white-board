import type { PrismaClient } from "@repo/construction-db";

import type { QueueHandler } from "../queue";
import type { ObjectStorage } from "./object-storage";

/**
 * The daily orphan clean-up (ADR CM-0021 §3, CM-0010, CM-0014): an object
 * under `companies/` that no live `stored_files` row points at and that
 * is more than 24 hours old is deleted. Abandoned uploads, files a failed
 * command left behind and files whose delete failed are all caught.
 *
 * Every object a Company keeps must have a live `stored_files` row
 * (`recordStoredFile`) within 24 hours of being written, or this job
 * deletes it.
 */
export const ORPHAN_FILES_JOB_TYPE = "files.orphans";

/** Younger objects may still be on their way to a `stored_files` row. */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/** At most this many objects are deleted per run; the next day continues. */
export const ORPHAN_DELETE_CAP = 1000;

export const COMPANY_FILES_PREFIX = "companies/";

type StoredFileReader = Pick<
  PrismaClient,
  "constructionOrganizationStoredFile"
>;

export type OrphanCleanUp = { scanned: number; deleted: string[] };

export async function deleteOrphanFiles(deps: {
  db: StoredFileReader;
  storage: ObjectStorage;
  now: Date;
  cap?: number;
  prefix?: string;
  signal?: AbortSignal;
}): Promise<OrphanCleanUp> {
  const cap = deps.cap ?? ORPHAN_DELETE_CAP;
  const cutoff = deps.now.getTime() - ORPHAN_MIN_AGE_MS;
  const deleted: string[] = [];
  let scanned = 0;
  let cursor: string | null = null;
  const stopped = () => deps.signal?.aborted === true;
  do {
    if (stopped()) break;
    const page = await deps.storage.list(deps.prefix ?? COMPANY_FILES_PREFIX, {
      cursor,
    });
    cursor = page.cursor;
    scanned += page.objects.length;
    const old = page.objects
      .filter((object) => object.uploadedAt.getTime() < cutoff)
      .map((object) => object.key);
    if (old.length === 0) continue;
    const live = await deps.db.constructionOrganizationStoredFile.findMany({
      where: { key: { in: old }, deletedAt: null },
      select: { key: true },
    });
    const kept = new Set(live.map((row) => row.key));
    for (const key of old) {
      if (kept.has(key)) continue;
      if (deleted.length >= cap || stopped()) break;
      try {
        await deps.storage.delete(key);
        deleted.push(key);
      } catch (error) {
        console.error(`Orphan file ${key} could not be deleted`, error);
      }
    }
  } while (cursor != null && deleted.length < cap);
  return { scanned, deleted };
}

/** `files.orphans`, run once a day by the daily cron. */
export function orphanFilesHandler(deps: {
  db: StoredFileReader;
  storage: ObjectStorage;
  clock?: () => Date;
}): QueueHandler {
  return {
    type: ORPHAN_FILES_JOB_TYPE,
    timeLimitMs: 240_000,
    async run(_job, signal) {
      await deleteOrphanFiles({
        db: deps.db,
        storage: deps.storage,
        now: (deps.clock ?? (() => new Date()))(),
        signal,
      });
    },
  };
}
