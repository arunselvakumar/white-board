import { prisma, type PrismaClient } from "@repo/construction-db";

import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import type {
  DprSource,
  FinanceReportSource,
  ReportRenderer,
  ReportStorage,
} from "../application/ports";
import {
  createReportExecutor,
  createReportHandlers,
  inlineReportRunner,
} from "../application/report-handlers";
import { storageImageLoader } from "./dpr-images";
import { createDprRenderer } from "./dpr-pdf";
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
 * (the job runs inside the request, stopped after 60 seconds) until M9
 * swaps in an SQS runner whose worker calls the same executor. The Daily
 * Progress Report's read model crosses contexts, so the composition root
 * passes it in (`src/composition/report-jobs.ts`).
 */
export function createReportingHandlers(
  db: PrismaClient = prisma,
  storage: ReportStorage = objectStorage(),
  options: {
    dpr?: DprSource;
    /** The finance reports' read model (CM-709). */
    finance?: FinanceReportSource;
    /** Tests shorten the 60-second limit. */
    timeLimitMs?: number;
  } = {},
) {
  const store = prismaReportJobStore(db);
  const executor = createReportExecutor({
    store,
    source: prismaReportSource(db),
    renderer: reportRenderer,
    storage,
    dpr:
      options.dpr == null
        ? undefined
        : {
            source: options.dpr,
            render: createDprRenderer(storageImageLoader(storage)),
          },
    finance: options.finance,
  });
  return createReportHandlers({
    store,
    projects: prismaProjectLookup(db),
    runner: inlineReportRunner(executor, { timeLimitMs: options.timeLimitMs }),
    storage,
  });
}
