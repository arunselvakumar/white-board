import { prisma, type PrismaClient } from "@repo/whiteboard-db";

import { DailyReportHandlers } from "../application/daily-report-handlers";
import type { DailyReportNotifier } from "../application/daily-report-ports";
import { EmailDailyReportNotifier } from "./email-daily-report-notifier";
import { PrismaDailyReportStore } from "./prisma-daily-report-store";

export function createDailyReportHandlers(deps?: {
  prisma?: PrismaClient;
  notifier?: DailyReportNotifier;
  now?: () => Date;
}): DailyReportHandlers {
  const db = deps?.prisma ?? prisma;
  const now = deps?.now ?? (() => new Date());
  return new DailyReportHandlers({
    store: new PrismaDailyReportStore(db),
    notifier: deps?.notifier ?? new EmailDailyReportNotifier(now, db),
    now,
  });
}
