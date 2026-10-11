import { prisma } from "@repo/construction-db";

import { createProgressReportSource } from "@/src/composition/progress-report-source";
import type { DprSource } from "@/src/reporting/application/ports";
import { createReportingHandlers } from "@/src/reporting/infrastructure/create-report-handlers";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

/**
 * The report job handlers every route uses, with the Daily Progress
 * Report's cross-context read model plugged in (CM-606). Reporting's own
 * factory cannot import site work or the other contexts; this one can.
 */
export function createReportJobs(
  options: { dpr?: DprSource; timeLimitMs?: number } = {},
) {
  return createReportingHandlers(prisma, objectStorage(), {
    dpr: options.dpr ?? createProgressReportSource(),
    timeLimitMs: options.timeLimitMs,
  });
}

export type ReportJobs = ReturnType<typeof createReportJobs>;
