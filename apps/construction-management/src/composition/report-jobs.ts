import { prisma } from "@repo/construction-db";

import { createFinanceReportSource } from "@/src/composition/finance-report-source";
import { createProgressReportSource } from "@/src/composition/progress-report-source";
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
import { createReportingHandlers } from "@/src/reporting/infrastructure/create-report-handlers";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

/**
 * The report job handlers every route uses, with the Daily Progress
 * Report's, the finance reports' and the tracking reports' cross-context
 * read models plugged in (CM-606, CM-709, CM-805). Reporting's own
 * factory cannot import site work or the other contexts; this one can.
 */
export function createReportJobs(
  options: {
    dpr?: DprSource;
    finance?: FinanceReportSource;
    tracking?: TrackingReportSource;
    taskProgress?: TaskProgressSource;
    timeLimitMs?: number;
  } = {},
) {
  return createReportingHandlers(prisma, objectStorage(), {
    dpr: options.dpr ?? createProgressReportSource(),
    finance: options.finance ?? createFinanceReportSource(),
    tracking: {
      source: options.tracking ?? createTrackingReportSource(),
      taskProgress: options.taskProgress ?? createTaskProgressSource(),
    },
    timeLimitMs: options.timeLimitMs,
  });
}

export type ReportJobs = ReturnType<typeof createReportJobs>;
