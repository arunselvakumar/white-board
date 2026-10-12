import { prisma } from "@repo/construction-db";

import { createFinanceReportSource } from "@/src/composition/finance-report-source";
import { createProgressReportSource } from "@/src/composition/progress-report-source";
import type {
  DprSource,
  FinanceReportSource,
} from "@/src/reporting/application/ports";
import { createReportingHandlers } from "@/src/reporting/infrastructure/create-report-handlers";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

/**
 * The report job handlers every route uses, with the Daily Progress
 * Report's and the finance reports' cross-context read models plugged in
 * (CM-606, CM-709). Reporting's own
 * factory cannot import site work or the other contexts; this one can.
 */
export function createReportJobs(
  options: {
    dpr?: DprSource;
    finance?: FinanceReportSource;
    timeLimitMs?: number;
  } = {},
) {
  return createReportingHandlers(prisma, objectStorage(), {
    dpr: options.dpr ?? createProgressReportSource(),
    finance: options.finance ?? createFinanceReportSource(),
    timeLimitMs: options.timeLimitMs,
  });
}

export type ReportJobs = ReturnType<typeof createReportJobs>;
