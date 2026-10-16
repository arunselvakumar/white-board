import type { QueueHandler } from "@/src/shared-kernel/queue";

import type { ReportJob } from "../domain/report-job";
import { retentionCutoff } from "../domain/report-retention";
import type { ReportStorage } from "./ports";

/** The daily job that expires old report files (ADR CM-0021 §3). */
export const REPORT_RETENTION_JOB_TYPE = "reporting.retention";

/** Jobs expired per batch, and at most per run (the next day continues). */
const BATCH = 100;
const RUN_CAP = 2000;

/** Where retention reads and writes report jobs. */
export type ReportRetentionStore = {
  /**
   * Done jobs that finished before `cutoff`, oldest first, Progress
   * Reports left out (they are kept until deleted).
   */
  expirable(cutoff: Date, limit: number): Promise<ReportJob[]>;
  /**
   * The job to `expired` with no file keys, its files no longer counted
   * as stored, and an audit event, in one transaction; false when it was
   * no longer done (deleted or changed meanwhile).
   */
  markExpired(job: ReportJob, at: Date): Promise<boolean>;
};

export type RetentionRun = { expired: string[] };

/**
 * Expires every report whose files are past 30 days: marks it expired
 * ("Expired — generate it again"), then deletes its files. A file whose
 * delete fails is left to the orphan clean-up, which finds no live
 * `stored_files` row for it.
 */
export async function expireOldReports(deps: {
  store: ReportRetentionStore;
  storage: ReportStorage;
  now: Date;
  signal?: AbortSignal;
}): Promise<RetentionRun> {
  const cutoff = retentionCutoff(deps.now);
  const expired: string[] = [];
  const stopped = () => deps.signal?.aborted === true;
  while (expired.length < RUN_CAP && !stopped()) {
    const jobs = await deps.store.expirable(cutoff, BATCH);
    let changed = 0;
    for (const job of jobs) {
      if (stopped()) break;
      if (!(await deps.store.markExpired(job, deps.now))) continue;
      changed += 1;
      expired.push(job.id);
      for (const key of [job.xlsxKey, job.pdfKey])
        if (key != null)
          await deps.storage.delete(key).catch((error: unknown) => {
            console.error(`Report file ${key} could not be deleted`, error);
          });
    }
    if (jobs.length < BATCH || changed === 0) break;
  }
  return { expired };
}

/** `reporting.retention`, run once a day by the daily cron. */
export function reportRetentionHandler(deps: {
  store: ReportRetentionStore;
  storage: ReportStorage;
  clock?: () => Date;
}): QueueHandler {
  return {
    type: REPORT_RETENTION_JOB_TYPE,
    timeLimitMs: 240_000,
    async run(_job, signal) {
      await expireOldReports({
        store: deps.store,
        storage: deps.storage,
        now: (deps.clock ?? (() => new Date()))(),
        signal,
      });
    },
  };
}
