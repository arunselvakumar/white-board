import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { ObservationHandlers } from "../application/observation-handlers";
import { ProgressReportHandlers } from "../application/progress-report-handlers";
import type { ProgressReportNotifier } from "../application/progress-report-ports";
import { EmailProgressReportNotifier } from "./email-progress-report-notifier";
import { PrismaObservationStore } from "./prisma-observation-store";
import { PrismaProgressReportStore } from "./prisma-progress-report-store";

export function createObservationHandlers(deps?: {
  prisma?: PrismaClient;
  now?: () => Date;
}): ObservationHandlers {
  return new ObservationHandlers({
    store: new PrismaObservationStore(deps?.prisma ?? prisma),
    now: deps?.now ?? (() => new Date()),
  });
}

export function createProgressReportHandlers(deps?: {
  prisma?: PrismaClient;
  notifier?: ProgressReportNotifier;
  now?: () => Date;
}): ProgressReportHandlers {
  return new ProgressReportHandlers({
    store: new PrismaProgressReportStore(deps?.prisma ?? prisma),
    notifier: deps?.notifier ?? new EmailProgressReportNotifier(),
    now: deps?.now ?? (() => new Date()),
  });
}
