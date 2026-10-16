import {
  LEASE_MARGIN_MS,
  STALE_QUEUED_MS,
  type EnqueueInput,
  type QueueHandler,
} from "@/src/shared-kernel/queue";

import { REPORT_TIME_LIMIT_MS, type ReportJob } from "../domain/report-job";
import type { ReportExecutor } from "./report-handlers";
import type { ReportRunner } from "./ports";

/** The queue handler key for one report job (ADR CM-0021 §1). */
export const REPORT_QUEUE_TYPE = "report";

type ReportQueuePayload = { reportJobId: string; workspaceId: string };

function payloadOf(value: unknown): ReportQueuePayload {
  const payload = value as Partial<ReportQueuePayload> | null;
  if (
    typeof payload?.reportJobId !== "string" ||
    typeof payload.workspaceId !== "string"
  )
    throw new Error("A report job needs reportJobId and workspaceId.");
  return { reportJobId: payload.reportJobId, workspaceId: payload.workspaceId };
}

/**
 * Runs a report job from the queue. Past `limitMs` the run is aborted and
 * the report fails with "took too long", once: a slow report is not
 * retried. A crash (the drain's own limit, a thrown error outside the
 * executor) is retried by the queue; when its attempts run out the report
 * fails with a generic message.
 */
export function reportQueueHandler(
  executor: ReportExecutor,
  options: { limitMs?: number } = {},
): QueueHandler {
  const limit = options.limitMs ?? REPORT_TIME_LIMIT_MS;
  return {
    type: REPORT_QUEUE_TYPE,
    // The drain's own stop sits just past the report's.
    timeLimitMs: limit + 5_000,
    async run(job) {
      const { reportJobId, workspaceId } = payloadOf(job.payload);
      const ref = { id: reportJobId, workspaceId };
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<true>((resolve) => {
        timer = setTimeout(() => {
          resolve(true);
        }, limit);
      });
      const run = executor
        .execute(ref, controller.signal, { resume: job.attempts > 1 })
        .then(() => false);
      try {
        if (await Promise.race([run, timedOut])) {
          controller.abort();
          run.catch((error: unknown) => {
            console.error(
              `Report job ${reportJobId} failed after its limit`,
              error,
            );
          });
          await executor.timeOut(ref, limit);
        }
      } finally {
        clearTimeout(timer);
      }
    },
    async onGiveUp(job) {
      const { reportJobId, workspaceId } = payloadOf(job.payload);
      await executor.fail(
        { id: reportJobId, workspaceId },
        "The report could not be generated. Try again.",
      );
    },
  };
}

/**
 * Hands report jobs to the queue: one queue job per report (deduplicated
 * by the report's id), then `kick` starts a drain for it. In a request
 * that is Next's `after()`; outside one (tests) the drain runs before
 * `enqueue` returns.
 */
export function queueReportRunner(deps: {
  enqueue(input: EnqueueInput): Promise<string>;
  kick(queueJobIds: readonly string[]): Promise<void>;
}): ReportRunner {
  return {
    async enqueue(job) {
      const id = await deps.enqueue({
        type: REPORT_QUEUE_TYPE,
        workspaceId: job.workspaceId,
        payload: { reportJobId: job.id, workspaceId: job.workspaceId },
        dedupeKey: `report:${job.id}`,
      });
      await deps.kick([id]);
    },
  };
}

/**
 * Jobs a polling screen should nudge (ADR CM-0021 §1): queued for more
 * than 15 seconds, or running past their limit and lease.
 */
export function stalledReports(
  jobs: readonly ReportJob[],
  now: Date,
  limitMs: number = REPORT_TIME_LIMIT_MS,
): ReportJob[] {
  const at = now.getTime();
  return jobs.filter(
    (job) =>
      (job.status === "queued" &&
        at - job.createdAt.getTime() > STALE_QUEUED_MS) ||
      (job.status === "running" &&
        job.startedAt != null &&
        at - job.startedAt.getTime() > limitMs + LEASE_MARGIN_MS),
  );
}
