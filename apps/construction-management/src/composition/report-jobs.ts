import { prisma } from "@repo/construction-db";

import { createFinanceReportSource } from "@/src/composition/finance-report-source";
import { createProgressReportSource } from "@/src/composition/progress-report-source";
import { enqueue, kickQueue } from "@/src/composition/queue";
import {
  createTaskProgressSource,
  createTrackingReportSource,
} from "@/src/composition/tracking-report-source";
import type {
  DprSource,
  FinanceReportSource,
  TaskProgressSource,
  TrackingReportSource,
} from "@/src/reporting/application/ports";
import {
  queueReportRunner,
  reportQueueHandler,
} from "@/src/reporting/application/report-queue";
import {
  createReportingExecutor,
  createReportingHandlers,
} from "@/src/reporting/infrastructure/create-report-handlers";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";
import type { QueueHandler } from "@/src/shared-kernel/queue";

type ReportJobsOptions = {
  dpr?: DprSource;
  finance?: FinanceReportSource;
  tracking?: TrackingReportSource;
  taskProgress?: TaskProgressSource;
  timeLimitMs?: number;
};

function reportQueueHandlerFor(options: ReportJobsOptions): QueueHandler {
  const executor = createReportingExecutor(prisma, objectStorage(), {
    dpr: options.dpr ?? createProgressReportSource(),
    finance: options.finance ?? createFinanceReportSource(),
    tracking: {
      source: options.tracking ?? createTrackingReportSource(),
      taskProgress: options.taskProgress ?? createTaskProgressSource(),
    },
  });
  return reportQueueHandler(executor, { limitMs: options.timeLimitMs });
}

/** The `report` queue handler with the app's read models (ADR CM-0021 §1). */
export function reportQueueHandlerFromEnv(): QueueHandler {
  return reportQueueHandlerFor({});
}

/**
 * The report job handlers every route uses, with the Daily Progress
 * Report's, the finance reports' and the tracking reports' cross-context
 * read models plugged in (CM-606, CM-709, CM-805). Reporting's own
 * factory cannot import site work or the other contexts; this one can.
 * Requests go on the queue; outside a request (tests) the drain runs
 * this instance's own handler, so a test's slow source or short limit
 * applies.
 */
export function createReportJobs(options: ReportJobsOptions = {}) {
  const handler = reportQueueHandlerFor(options);
  const handlers = createReportingHandlers(prisma, objectStorage(), {
    runner: queueReportRunner({
      enqueue,
      kick: (ids) => kickQueue(ids, [handler]),
    }),
  });
  const heal = (jobs: Parameters<typeof handlers.heal>[0]) =>
    handlers.heal(jobs, options.timeLimitMs);
  return {
    ...handlers,
    heal,
    /** A read nudges the job when it is stuck (ADR CM-0021 §1). */
    async get(workspaceId: string, id: string) {
      const job = await handlers.get(workspaceId, id);
      await heal([job]);
      return job;
    },
    async list(...args: Parameters<typeof handlers.list>) {
      const jobs = await handlers.list(...args);
      await heal(jobs);
      return jobs;
    },
  };
}

export type ReportJobs = ReturnType<typeof createReportJobs>;
