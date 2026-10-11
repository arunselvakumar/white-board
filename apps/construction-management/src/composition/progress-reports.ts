import {
  createReportJobs,
  type ReportJobs,
} from "@/src/composition/report-jobs";
import { siteRecordDirectory } from "@/src/composition/site-record-directory";
import type { ReportJob } from "@/src/reporting/domain/report-job";
import { ProgressReportHandlers } from "@/src/site-work/application/progress-report-handlers";
import type {
  ProgressReportJob,
  ProgressReportJobs,
} from "@/src/site-work/application/ports";
import { prismaProgressReportNumbers } from "@/src/site-work/infrastructure/prisma-progress-report-numbers";
import { companyToday } from "@/src/shared-kernel/company-today";
import { DomainError, notFound } from "@/src/shared-kernel/domain-error";
import { prisma } from "@repo/construction-db";

const progressReportNotFound = () =>
  notFound("PROGRESS_REPORT_NOT_FOUND", "This Progress Report was not found.");

/** A reporting job as a DPR; null when it is another kind of report. */
function toProgressReport(job: ReportJob): ProgressReportJob | null {
  const params = job.params;
  if (params.kind !== "daily_progress_report" || job.projectId == null)
    return null;
  return {
    id: job.id,
    projectId: job.projectId,
    number: params.number,
    date: params.date,
    filledBy: params.filledBy,
    includeImages: params.includeImages,
    status: job.status,
    error: job.error,
    includesMoney: job.includesMoney,
    requestedBy: job.requestedBy,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  };
}

/**
 * Site work's `ProgressReportJobs` port over the reporting context's job
 * handlers (CM-606): Daily Progress Report jobs only.
 */
export function progressReportJobs(reports: ReportJobs): ProgressReportJobs {
  async function load(workspaceId: string, id: string) {
    const job = await reports.get(workspaceId, id).catch((error: unknown) => {
      if (error instanceof DomainError && error.code === "REPORT_NOT_FOUND")
        return null;
      throw error;
    });
    const report = job == null ? null : toProgressReport(job);
    if (job == null || report == null) throw progressReportNotFound();
    return { job, report };
  }
  const report = (job: ReportJob) => {
    const found = toProgressReport(job);
    if (found == null) throw progressReportNotFound();
    return found;
  };
  return {
    async request(input) {
      return report(
        await reports.request({
          workspaceId: input.workspaceId,
          userId: input.userId,
          projectId: input.projectId,
          includesMoney: input.includesMoney,
          params: {
            kind: "daily_progress_report",
            date: input.date,
            filledBy: input.filledBy,
            includeImages: input.includeImages,
            number: input.number,
          },
        }),
      );
    },
    async list(workspaceId, projectId) {
      const jobs = await reports.list(workspaceId, {
        projectId,
        kinds: ["daily_progress_report"],
      });
      return jobs.flatMap((job) => toProgressReport(job) ?? []);
    },
    async get(workspaceId, id) {
      return (await load(workspaceId, id)).report;
    },
    async retry(workspaceId, id) {
      return report(await reports.retry((await load(workspaceId, id)).job));
    },
    async remove(workspaceId, id, by) {
      await reports.remove((await load(workspaceId, id)).job, by);
    },
    async pdf(workspaceId, id) {
      return reports.download((await load(workspaceId, id)).job, "pdf");
    },
  };
}

/**
 * The Progress Reports handlers (CM-606) wired to Prisma, the numbering
 * rules and the report jobs. Tests pass their own `reports` (a short time
 * limit, a slow source).
 */
export function createProgressReportHandlers(
  options: { reports?: ReportJobs } = {},
): ProgressReportHandlers {
  return new ProgressReportHandlers({
    numbers: prismaProgressReportNumbers(prisma),
    jobs: progressReportJobs(options.reports ?? createReportJobs()),
    directory: siteRecordDirectory(prisma),
    today: (workspaceId) => companyToday(prisma, workspaceId),
  });
}
