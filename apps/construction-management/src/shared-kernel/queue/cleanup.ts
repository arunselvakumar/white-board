import type { PrismaClient } from "@repo/construction-db";

import type { QueueHandler } from "./queue";

/** The daily job that deletes finished queue rows (ADR CM-0021 §3). */
export const QUEUE_CLEANUP_JOB_TYPE = "queue.cleanup";

/** Finished queue rows are kept this long, for looking into a failure. */
export const FINISHED_QUEUE_ROWS_KEPT_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes queue rows that finished (done or failed for good) more than
 * 14 days before `now`; returns how many. Queued and running rows are
 * never touched: the queue row only says "run X", and the record a
 * screen reads (a report job, a backup) keeps its own history.
 */
export async function deleteFinishedQueueJobs(
  db: Pick<PrismaClient, "constructionOrganizationQueueJob">,
  now: Date,
): Promise<number> {
  const cutoff = new Date(
    now.getTime() - FINISHED_QUEUE_ROWS_KEPT_DAYS * DAY_MS,
  );
  const deleted = await db.constructionOrganizationQueueJob.deleteMany({
    where: { status: { in: ["done", "failed"] }, finishedAt: { lt: cutoff } },
  });
  return deleted.count;
}

/** `queue.cleanup`, run once a day by the daily cron. */
export function queueCleanupHandler(
  db: Pick<PrismaClient, "constructionOrganizationQueueJob">,
  clock: () => Date = () => new Date(),
): QueueHandler {
  return {
    type: QUEUE_CLEANUP_JOB_TYPE,
    timeLimitMs: 60_000,
    async run() {
      await deleteFinishedQueueJobs(db, clock());
    },
  };
}
