import { prisma, type PrismaClient } from "@repo/construction-db";

import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import type { ReportRenderer, ReportStorage } from "../application/ports";
import {
  createReportExecutor,
  createReportHandlers,
  inlineReportRunner,
} from "../application/report-handlers";
import { renderPdf } from "./pdf-report";
import { prismaReportJobStore } from "./prisma-report-job-store";
import {
  prismaProjectLookup,
  prismaReportSource,
} from "./prisma-report-source";
import { renderXlsx } from "./xlsx-report";

export const reportRenderer: ReportRenderer = {
  xlsx: renderXlsx,
  pdf: renderPdf,
};

/**
 * Report jobs wired to Postgres and private storage. The runner is inline
 * (the job runs inside the request) until M9 swaps in an SQS runner whose
 * worker calls the same executor.
 */
export function createReportingHandlers(
  db: PrismaClient = prisma,
  storage: ReportStorage = objectStorage(),
) {
  const store = prismaReportJobStore(db);
  const executor = createReportExecutor({
    store,
    source: prismaReportSource(db),
    renderer: reportRenderer,
    storage,
  });
  return createReportHandlers({
    store,
    projects: prismaProjectLookup(db),
    runner: inlineReportRunner(executor),
    storage,
  });
}
