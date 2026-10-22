import { prisma, type PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  calendarDateToDb,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { newId } from "@/src/shared-kernel/ids";
import { isUniqueViolation } from "@/src/shared-kernel/prisma-errors";
import { nextSequenceNumber } from "@/src/shared-kernel/sequence/next-sequence-number";

import type { ProgressReportNumbers } from "../application/ports";
import { PROGRESS_REPORT_SEQUENCE } from "../domain/progress-report";

type Db = Pick<PrismaClient, "constructionSiteWorkProgressReportNumber">;

async function existing(
  db: Db,
  workspaceId: string,
  projectId: string,
  date: CalendarDate,
): Promise<string | null> {
  const row = await db.constructionSiteWorkProgressReportNumber.findFirst({
    where: { workspaceId, projectId, reportDate: calendarDateToDb(date) },
    select: { number: true },
  });
  return row?.number ?? null;
}

/**
 * One DPR number per Project per date (CM-0016 §15). The first request for
 * a date takes the next number from the numbering rule (`DPR/26-27/00001`)
 * in a transaction; a second request reuses it. Two requests for the same
 * new date race on the `(project_id, report_date)` unique index: the loser
 * rolls back (its counter increment too, so no number is skipped) and
 * reads the winner's number.
 */
export function prismaProgressReportNumbers(
  db: PrismaClient = prisma,
): ProgressReportNumbers {
  return {
    async take({ workspaceId, projectId, date, by }) {
      const found = await existing(db, workspaceId, projectId, date);
      if (found != null) return { number: found, taken: false };
      try {
        const number = await db.$transaction(async (tx) => {
          const allocated = await nextSequenceNumber(tx, {
            workspaceId,
            module: PROGRESS_REPORT_SEQUENCE,
            projectId,
            date,
            by,
          });
          const id = newId();
          await tx.constructionSiteWorkProgressReportNumber.create({
            data: {
              id,
              workspaceId,
              projectId,
              reportDate: calendarDateToDb(date),
              number: allocated.number,
              createdBy: by,
            },
          });
          await recordAudit(tx, {
            workspaceId,
            actorUserId: by,
            action: "progress_report.number_taken",
            entityType: "progress_report_number",
            entityId: id,
            after: { projectId, date, number: allocated.number },
          });
          return allocated.number;
        });
        return { number, taken: true };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const winner = await existing(db, workspaceId, projectId, date);
        if (winner == null) throw error;
        return { number: winner, taken: false };
      }
    },
  };
}
