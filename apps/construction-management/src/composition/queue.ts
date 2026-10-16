import { prisma } from "@repo/construction-db";
import { after } from "next/server";

import {
  createQueueDrain,
  DRAIN_BUDGET_MS,
  prismaQueueStore,
  type DrainResult,
  type EnqueueInput,
  type QueueHandler,
} from "@/src/shared-kernel/queue";

import { REPORT_RETENTION_JOB_TYPE } from "@/src/reporting/application/report-retention";
import {
  ORPHAN_FILES_JOB_TYPE,
  orphanFilesHandler,
} from "@/src/shared-kernel/files/orphan-files";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import {
  QUEUE_CLEANUP_JOB_TYPE,
  queueCleanupHandler,
} from "@/src/shared-kernel/queue/cleanup";

import {
  reportQueueHandlerFromEnv,
  reportRetentionHandlerFromEnv,
} from "./report-jobs";

/**
 * Every queue handler in the app (ADR CM-0021 §1). A context exports its
 * handler; only this composition root lists them, so no context imports
 * another's. Add a handler here and, for a daily job, its type to
 * `DAILY_JOB_TYPES`.
 */
export function queueHandlers(): QueueHandler[] {
  return [
    reportQueueHandlerFromEnv(),
    // Retention and clean-up (CM-901, ADR CM-0021 §3).
    reportRetentionHandlerFromEnv(),
    queueCleanupHandler(prisma),
    orphanFilesHandler({ db: prisma, storage: objectStorage() }),
  ];
}

/**
 * Handler types the daily cron enqueues once per day (dedupe key
 * `daily:<type>:<date>`): retention, orphan clean-up, "became delayed"
 * notifications, Company deletions that are due.
 */
export const DAILY_JOB_TYPES: readonly string[] = [
  // Retention and clean-up (CM-901, ADR CM-0021 §3).
  REPORT_RETENTION_JOB_TYPE,
  QUEUE_CLEANUP_JOB_TYPE,
  ORPHAN_FILES_JOB_TYPE,
];

export const queueStore = prismaQueueStore(prisma);

export function enqueue(input: EnqueueInput): Promise<string> {
  return queueStore.enqueue(input, new Date());
}

export function drainQueue(options: {
  budgetMs?: number;
  types?: readonly string[];
  ids?: readonly string[];
  handlers?: readonly QueueHandler[];
}): Promise<DrainResult> {
  return createQueueDrain({
    store: queueStore,
    handlers: options.handlers ?? queueHandlers(),
  }).drain({
    budgetMs: options.budgetMs ?? DRAIN_BUDGET_MS,
    types: options.types,
    ids: options.ids,
  });
}

/**
 * Starts a drain without holding the response: in a request, Next's
 * `after()` runs every due job once the response is sent (the route must
 * declare `maxDuration = 300`). Outside a request (HTTP tests call route
 * handlers directly) it drains just `ids` with `handlers` before
 * returning, so a test sees its own job finished and never another
 * test's.
 */
export async function kickQueue(
  ids: readonly string[],
  handlers?: readonly QueueHandler[],
): Promise<void> {
  try {
    after(async () => {
      try {
        await drainQueue({});
      } catch (error) {
        console.error("Queue drain failed", error);
      }
    });
  } catch {
    await drainQueue({ ids, handlers });
  }
}

/** The day's key for a daily job, in UTC. */
export function dailyDedupeKey(type: string, now: Date): string {
  return `daily:${type}:${now.toISOString().slice(0, 10)}`;
}

/** The daily cron: enqueue each daily job once, then drain. */
export async function runDailyJobs(
  now: Date = new Date(),
): Promise<DrainResult & { enqueued: string[] }> {
  for (const type of DAILY_JOB_TYPES)
    await queueStore.enqueue(
      {
        type,
        workspaceId: null,
        payload: { date: now.toISOString().slice(0, 10) },
        dedupeKey: dailyDedupeKey(type, now),
      },
      now,
    );
  const result = await drainQueue({});
  return { ...result, enqueued: [...DAILY_JOB_TYPES] };
}
