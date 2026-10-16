import { prisma, type PrismaClient } from "@repo/construction-db";

import type { EventDispatcher } from "@/src/shared-kernel/events";
import { objectStorage } from "@/src/shared-kernel/files/storage-from-env";

import type {
  DprSource,
  FinanceReportSource,
  ReportRenderer,
  ReportRunner,
  ReportStorage,
  TaskProgressSource,
  TrackingReportSource,
} from "../application/ports";
import {
  createReportExecutor,
  createReportHandlers,
  inlineReportRunner,
  type ReportExecutor,
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

/** The Excel and PDF writers; the PDF loads its header logo from `storage`. */
export function reportRenderer(storage: ReportStorage): ReportRenderer {
  const images = storageImageLoader(storage);
  return {
    xlsx: renderXlsx,
    pdf: (document) => renderPdf(document, images),
  };
}

type ReportingOptions = {
  /** `ReportFinished` listeners (messaging, CM-904). */
  events?: EventDispatcher;
  dpr?: DprSource;
  /** The finance reports' read model (CM-709). */
  finance?: FinanceReportSource;
  /** The tracking reports' and Task Progress Report's read models (CM-805). */
  tracking?: {
    source: TrackingReportSource;
    taskProgress: TaskProgressSource;
  };
};

/**
 * The executor that runs one report job: reads, renders, stores. The
 * queue's `report` handler calls it (ADR CM-0021 §1). The Daily Progress
 * Report's and other cross-context read models are passed in by the
 * composition root (`src/composition/report-jobs.ts`).
 */
export function createReportingExecutor(
  db: PrismaClient = prisma,
  storage: ReportStorage = objectStorage(),
  options: ReportingOptions = {},
): ReportExecutor {
  const renderDpr = createDprRenderer(storageImageLoader(storage));
  return createReportExecutor({
    store: prismaReportJobStore(db),
    source: prismaReportSource(db),
    renderer: reportRenderer(storage),
    storage,
    dpr:
      options.dpr == null
        ? undefined
        : {
            source: options.dpr,
            render: renderDpr,
          },
    finance: options.finance,
    tracking:
      options.tracking == null
        ? undefined
        : { ...options.tracking, render: renderDpr },
    events: options.events,
  });
}

/**
 * Report jobs wired to Postgres and private storage. `runner` hands each
 * job to the queue (`queueReportRunner`); without one the job runs in the
 * request (unit-test style).
 */
export function createReportingHandlers(
  db: PrismaClient = prisma,
  storage: ReportStorage = objectStorage(),
  options: ReportingOptions & {
    runner?: ReportRunner;
    /** Tests shorten the 240-second limit. */
    timeLimitMs?: number;
  } = {},
) {
  const runner =
    options.runner ??
    inlineReportRunner(createReportingExecutor(db, storage, options), {
      timeLimitMs: options.timeLimitMs,
    });
  return createReportHandlers({
    store: prismaReportJobStore(db),
    projects: prismaProjectLookup(db),
    runner,
    storage,
  });
}
