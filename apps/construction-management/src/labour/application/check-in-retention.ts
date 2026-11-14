import type { ObjectStorage } from "@/src/shared-kernel/files";
import type { QueueHandler } from "@/src/shared-kernel/queue";

import { CHECK_IN_PHOTO_RETENTION_DAYS } from "../domain/check-in";

/** The daily job that removes check-in photos past their 90 days (ADR CM-0043 §6). */
export const CHECK_IN_PHOTO_RETENTION_JOB_TYPE =
  "labour.check_in_photo_retention";

/** Photos removed per batch, and at most per run (the next day continues). */
const BATCH = 200;
const RUN_CAP = 5000;

const DAY_MS = 86_400_000;

/** An entry whose photo is due to go. */
export type ExpiredCheckInPhoto = {
  id: string;
  workspaceId: string;
  photoKey: string;
};

export type CheckInRetentionStore = {
  /** Entries before `cutoff` that still have a photo, oldest first. */
  expired(cutoff: Date, limit: number): Promise<ExpiredCheckInPhoto[]>;
  /**
   * In one transaction: `photo_key` to null and `photo_removed_at` to
   * `at` on the entry, and its `stored_files` row tombstoned, so it no
   * longer counts toward storage. False when the photo was already gone.
   */
  removePhoto(entry: ExpiredCheckInPhoto, at: Date): Promise<boolean>;
};

/** Entries before this instant lose their photo. */
export function checkInPhotoCutoff(now: Date): Date {
  return new Date(now.getTime() - CHECK_IN_PHOTO_RETENTION_DAYS * DAY_MS);
}

/**
 * Removes the photos of entries older than 90 days, in batches: the entry
 * keeps its time and location and reads "Photo removed". A photo whose
 * delete from storage fails is left to the orphan clean-up, which finds
 * no live `stored_files` row for it.
 */
export async function removeOldCheckInPhotos(deps: {
  store: CheckInRetentionStore;
  storage: ObjectStorage;
  now: Date;
  signal?: AbortSignal;
}): Promise<{ removed: string[] }> {
  const cutoff = checkInPhotoCutoff(deps.now);
  const removed: string[] = [];
  const stopped = () => deps.signal?.aborted === true;
  while (removed.length < RUN_CAP && !stopped()) {
    const batch = await deps.store.expired(cutoff, BATCH);
    let changed = 0;
    for (const entry of batch) {
      if (stopped()) break;
      if (!(await deps.store.removePhoto(entry, deps.now))) continue;
      changed += 1;
      removed.push(entry.id);
      await deps.storage.delete(entry.photoKey).catch((error: unknown) => {
        console.error(
          `Check-in photo ${entry.photoKey} could not be deleted`,
          error,
        );
      });
    }
    if (batch.length < BATCH || changed === 0) break;
  }
  return { removed };
}

/** `labour.check_in_photo_retention`, run once a day by the daily cron. */
export function checkInPhotoRetentionHandler(deps: {
  store: CheckInRetentionStore;
  storage: ObjectStorage;
  clock?: () => Date;
}): QueueHandler {
  return {
    type: CHECK_IN_PHOTO_RETENTION_JOB_TYPE,
    timeLimitMs: 240_000,
    async run(_job, signal) {
      await removeOldCheckInPhotos({
        store: deps.store,
        storage: deps.storage,
        now: (deps.clock ?? (() => new Date()))(),
        signal,
      });
    },
  };
}
