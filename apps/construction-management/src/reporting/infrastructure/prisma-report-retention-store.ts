import type { PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import { markStoredFileDeleted } from "@/src/shared-kernel/files/stored-files";

import type { ReportRetentionStore } from "../application/report-retention";
import {
  PROGRESS_REPORT_KINDS,
  type ReportJob,
  type ReportParams,
} from "../domain/report-job";

/** Retention runs as no one: the audit names the system. */
export const RETENTION_ACTOR = "system";

/** Retention's reads and writes of `construction_reporting.report_jobs`. */
export function prismaReportRetentionStore(
  db: PrismaClient,
): ReportRetentionStore {
  return {
    async expirable(cutoff, limit) {
      const rows = await db.constructionReportingReportJob.findMany({
        where: {
          status: "done",
          finishedAt: { lt: cutoff },
          kind: { notIn: [...PROGRESS_REPORT_KINDS] },
        },
        orderBy: [{ finishedAt: "asc" }, { id: "asc" }],
        take: limit,
      });
      return rows.map((row): ReportJob => ({
        ...row,
        params: row.params as ReportParams,
      }));
    },

    async markExpired(job, at) {
      return db.$transaction(async (tx) => {
        const updated = await tx.constructionReportingReportJob.updateMany({
          where: { id: job.id, status: "done" },
          data: { status: "expired", xlsxKey: null, pdfKey: null },
        });
        if (updated.count === 0) return false;
        for (const key of [job.xlsxKey, job.pdfKey])
          if (key != null)
            await markStoredFileDeleted(tx, job.workspaceId, key, at);
        await recordAudit(tx, {
          workspaceId: job.workspaceId,
          actorUserId: RETENTION_ACTOR,
          action: "report_job.expired",
          entityType: "report_job",
          entityId: job.id,
          before: {
            status: "done",
            xlsxKey: job.xlsxKey,
            pdfKey: job.pdfKey,
            fileName: job.fileName,
            finishedAt: job.finishedAt,
          },
          after: { status: "expired" },
          occurredAt: at,
        });
        return true;
      });
    },
  };
}
