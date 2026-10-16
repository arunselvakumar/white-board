import type { PrismaClient } from "@repo/construction-db";

import { recordAudit } from "@/src/shared-kernel/audit";
import {
  markStoredFileDeleted,
  recordStoredFile,
} from "@/src/shared-kernel/files/stored-files";

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
      /** Thrown inside the transaction to roll back a job no longer running. */
      const notRunning = new Error("not running");
      try {
        await db.$transaction(async (tx) => {
          const updated = await tx.constructionReportingReportJob.updateMany({
            where: { id: job.id, status: "running" },
            data: {
              status: "done",
              xlsxKey: files.xlsx?.key ?? null,
              pdfKey: files.pdf.key,
              fileName: files.fileName,
              finishedAt: at,
            },
          });
          if (updated.count === 0) throw notRunning;
          for (const file of [files.xlsx, files.pdf])
            if (file != null)
              await recordStoredFile(tx, {
                workspaceId: job.workspaceId,
                key: file.key,
                kind: REPORT_FILE_KIND,
                contentType: file.contentType,
                bytes: file.bytes,
                createdBy: job.requestedBy,
                createdAt: at,
              });
        });
        return true;
      } catch (error) {
        if (error === notRunning) return false;
        throw error;
      }
    },

    async markFailed(id, error, at) {
      const updated = await db.constructionReportingReportJob.updateMany({
        where: { id, status: { in: ["queued", "running"] } },
        data: { status: "failed", error, finishedAt: at },
      });
      return updated.count > 0;
    },

    async requeue(workspaceId, id) {
      const updated = await db.constructionReportingReportJob.updateMany({
        where: { id, workspaceId, status: "failed" },
        data: {
          status: "queued",
          error: null,
          startedAt: null,
          finishedAt: null,
        },
      });
      return updated.count > 0;
    },

    async requeueRunning(workspaceId, id) {
      const updated = await db.constructionReportingReportJob.updateMany({
        where: { id, workspaceId, status: "running" },
        data: { status: "queued", startedAt: null },
      });
      return updated.count > 0;
    },

    countUnfinished(workspaceId, requestedBy) {
      return db.constructionReportingReportJob.count({
        where: {
          workspaceId,
          requestedBy,
          status: { in: ["queued", "running"] },
        },
      });
    },

    async remove(job, by, at) {
      await db.$transaction(async (tx) => {
        await tx.constructionReportingReportJob.deleteMany({
          where: { id: job.id, workspaceId: job.workspaceId },
        });
        for (const key of [job.xlsxKey, job.pdfKey])
          if (key != null)
            await markStoredFileDeleted(tx, job.workspaceId, key, at);
        await recordAudit(tx, {
          workspaceId: job.workspaceId,
          actorUserId: by,
          action: "report_job.deleted",
          entityType: "report_job",
          entityId: job.id,
          before: {
            kind: job.kind,
            projectId: job.projectId,
            params: job.params,
            status: job.status,
            fileName: job.fileName,
          },
          occurredAt: at,
        });
      });
    },
  };
}
