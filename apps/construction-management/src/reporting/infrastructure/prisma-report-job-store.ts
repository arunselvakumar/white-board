import type { PrismaClient } from "@repo/construction-db";

import { recordStoredFile } from "@/src/shared-kernel/files/stored-files";

import { REPORT_FILE_KIND } from "../application/report-handlers";
import type { ReportJobStore } from "../application/ports";
import type { ReportJob, ReportParams } from "../domain/report-job";

type Row = NonNullable<
  Awaited<
    ReturnType<PrismaClient["constructionReportingReportJob"]["findFirst"]>
  >
>;

function toJob(row: Row): ReportJob {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    kind: row.kind,
    params: row.params as ReportParams,
    status: row.status,
    includesMoney: row.includesMoney,
    xlsxKey: row.xlsxKey,
    pdfKey: row.pdfKey,
    fileName: row.fileName,
    error: row.error,
    requestedBy: row.requestedBy,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

/** `construction_reporting.report_jobs` (CM-217). */
export function prismaReportJobStore(db: PrismaClient): ReportJobStore {
  return {
    async create(job) {
      await db.constructionReportingReportJob.create({
        data: {
          id: job.id,
          workspaceId: job.workspaceId,
          projectId: job.projectId,
          kind: job.kind,
          params: job.params,
          status: job.status,
          includesMoney: job.includesMoney,
          requestedBy: job.requestedBy,
          createdAt: job.createdAt,
        },
      });
    },

    async get(workspaceId, id) {
      const row = await db.constructionReportingReportJob.findFirst({
        where: { id, workspaceId },
      });
      return row == null ? null : toJob(row);
    },

    async list(workspaceId, filter) {
      const rows = await db.constructionReportingReportJob.findMany({
        where: {
          workspaceId,
          projectId: filter.projectId,
          kind: { in: [...filter.kinds] },
          ...(filter.requestedBy == null
            ? {}
            : { requestedBy: filter.requestedBy }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: filter.limit,
      });
      return rows.map(toJob);
    },

    async markRunning(id, at) {
      await db.constructionReportingReportJob.update({
        where: { id },
        data: { status: "running", startedAt: at },
      });
    },

    async markDone(job, files, at) {
      await db.$transaction(async (tx) => {
        for (const file of [files.xlsx, files.pdf])
          await recordStoredFile(tx, {
            workspaceId: job.workspaceId,
            key: file.key,
            kind: REPORT_FILE_KIND,
            contentType: file.contentType,
            bytes: file.bytes,
            createdBy: job.requestedBy,
            createdAt: at,
          });
        await tx.constructionReportingReportJob.update({
          where: { id: job.id },
          data: {
            status: "done",
            xlsxKey: files.xlsx.key,
            pdfKey: files.pdf.key,
            fileName: files.fileName,
            finishedAt: at,
          },
        });
      });
    },

    async markFailed(id, error, at) {
      await db.constructionReportingReportJob.update({
        where: { id },
        data: { status: "failed", error, finishedAt: at },
      });
    },
  };
}
