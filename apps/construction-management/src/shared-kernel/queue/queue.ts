/**
 * The kernel's Postgres job queue (ADR CM-0021 §1). A job is a row in
 * `construction_organization.queue_jobs` naming a handler `type`; a drain
 * claims due jobs one at a time and runs their handlers. There is no worker
 * process: drains start right after a request (Next `after()`), from a
 * screen's poll, and from the daily cron.
 */

/** A claimed job as a handler sees it. */
export type QueueJob = {
  id: string;
  workspaceId: string | null;
  type: string;
  payload: unknown;
  /** This run's attempt, counting from 1. */
  attempts: number;
  maxAttempts: number;
};

export type EnqueueInput = {
  type: string;
  workspaceId: string | null;
  payload: unknown;
  /**
   * At most one unfinished job per key: enqueueing again while one is
   * queued or running adds nothing (e.g. `report:<id>`, `daily:retention:2026-10-16`).
   */
  dedupeKey?: string;
  runAfter?: Date;
  maxAttempts?: number;
};

/**
 * What runs one type of job. `run` gets a signal that aborts at
 * `timeLimitMs`; a handler that throws is retried with backoff until its
 * attempts run out, then `onGiveUp` runs (e.g. mark the report failed).
 */
export type QueueHandler = {
  type: string;
  timeLimitMs: number;
  run(job: QueueJob, signal: AbortSignal): Promise<void>;
  onGiveUp?(job: QueueJob, error: string): Promise<void>;
};

/** Retry delays after the 1st, 2nd and later failed attempts. */
export const RETRY_DELAYS_MS: readonly number[] = [30_000, 120_000, 600_000];

export function retryDelayMs(attempts: number): number {
  const index = Math.min(Math.max(attempts - 1, 0), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index] ?? 600_000;
}

/** A claimed job's lease: its handler's limit plus 30 seconds. */
export const LEASE_MARGIN_MS = 30_000;

/** The time a drain may spend: inside Vercel Hobby's 300-second ceiling. */
export const DRAIN_BUDGET_MS = 270_000;

/** A queued job older than this is "stuck" for a polling screen. */
export const STALE_QUEUED_MS = 15_000;

export class QueueJobTimedOut extends Error {
  constructor(limitMs: number) {
    super(`The job took longer than ${String(Math.round(limitMs / 1000))} s.`);
    this.name = "QueueJobTimedOut";
  }
}

/** A short, storable message for `last_error`. */
export function queueErrorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
}

/** Where jobs live; Prisma in production, the same in HTTP tests. */
export type QueueStore = {
  /** The job's id: the new row's, or the unfinished one's with that key. */
  enqueue(input: EnqueueInput, now: Date): Promise<string>;
  /**
   * Claims the oldest due job of one of `types` (queued and due, or
   * running with a passed lease), marking it running with a lease of the
   * type's limit plus the margin. Null when none is due.
   */
  claim(
    types: ReadonlyMap<string, number>,
    now: Date,
    onlyIds?: readonly string[],
  ): Promise<QueueJob | null>;
  complete(id: string, now: Date): Promise<void>;
  /** Back to queued at `runAfter`, keeping the error. */
  retry(id: string, error: string, runAfter: Date): Promise<void>;
  /** Finished for good. */
  giveUp(id: string, error: string, now: Date): Promise<void>;
  /** Whether a job with this key is queued or running. */
  hasUnfinished(dedupeKey: string): Promise<boolean>;
};
