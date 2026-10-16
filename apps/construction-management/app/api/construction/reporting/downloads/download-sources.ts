import { prisma } from "@repo/construction-db";

import type { AccessSession } from "@/app/api/_lib/require-access";
import { PROGRESS_REPORTS_PATH } from "@/app/api/construction/site-work/progress-reports/progress-report-models";
import { periodLabel } from "@/src/reporting/application/build-report";
import {
  canDownloadReport,
  canRequestReport,
  canSeeReportMoney,
} from "@/src/reporting/application/report-access";
import { catalogueEntry } from "@/src/reporting/domain/report-catalogue";
import {
  REPORT_TITLES,
  reportFormats,
  type ReportJob,
} from "@/src/reporting/domain/report-job";
import { reportExpiresAt } from "@/src/reporting/domain/report-retention";
import { prismaProjectNames } from "@/src/reporting/infrastructure/prisma-report-source";
import { can } from "@/src/shared-kernel/access";

import { mayOpen, reports } from "../reports/handlers";
import { downloadPath, REPORTS_PATH } from "../reports/report-models";
import type {
  ConstructionReportingDownloadItemModel,
  DownloadCursor,
  DownloadSourceKey,
} from "./download-models";

/**
 * One kind of thing Downloads lists (see "HOW TO ADD A SOURCE" in
 * `download-models.ts`): the member's own rows, newest first by
 * `createdAt` then `id`, strictly before `before`, at most `limit`.
 */
export type DownloadSource = {
  source: DownloadSourceKey;
  list(
    session: AccessSession,
    page: { before: DownloadCursor | null; limit: number },
  ): Promise<ConstructionReportingDownloadItemModel[]>;
};

const projectNames = prismaProjectNames(prisma);

const FILE_LABELS = { xlsx: "Excel", pdf: "PDF" } as const;

function detailOf(job: ReportJob): string {
  const period = periodLabel(job);
  return job.params.kind === "daily_progress_report"
    ? `${job.params.number} · ${period}`
    : period;
}

/**
 * Report jobs (CM-901): every report the member asked for, on any Project
 * or central, Progress Reports included. Download, Retry and Delete are
 * offered when the route behind each would allow them: a Progress
 * Report's go to its own module's routes.
 */
export const reportDownloadSource: DownloadSource = {
  source: "report",
  async list(session, page) {
    const jobs = await reports.listOwn(session.workspaceId, session.userId, {
      before: page.before,
      limit: page.limit,
    });
    const names = await projectNames.names(
      session.workspaceId,
      jobs.flatMap((job) => job.projectId ?? []),
    );
    return jobs.map((job) => {
      const progress = catalogueEntry(job.kind).progressReport;
      const scope = job.projectId == null ? {} : { projectId: job.projectId };
      const money =
        !job.includesMoney ||
        canSeeReportMoney(session.access, job.kind, job.projectId);
      const opens = progress
        ? canDownloadReport(session.access, job.kind, job.projectId)
        : mayOpen(session, job);
      const files =
        job.status === "done" && opens && money
          ? reportFormats(job.kind).flatMap((format) => {
              const key = format === "xlsx" ? job.xlsxKey : job.pdfKey;
              if (key == null) return [];
              return [
                {
                  format,
                  label: FILE_LABELS[format],
                  href: progress
                    ? `${PROGRESS_REPORTS_PATH}/${job.id}/download`
                    : downloadPath(job.id, format),
                },
              ];
            })
          : [];
      const retries =
        job.status === "failed" &&
        (progress
          ? can(session.access, "site_work.progress_reports", "create", scope)
          : canRequestReport(session.access, job.kind, job.projectId));
      const deletes =
        !progress ||
        can(session.access, "site_work.progress_reports", "delete", scope);
      const base = progress ? PROGRESS_REPORTS_PATH : REPORTS_PATH;
      return {
        source: "report",
        id: job.id,
        kind: job.kind,
        title: REPORT_TITLES[job.kind],
        detail: detailOf(job),
        projectId: job.projectId,
        projectName:
          job.projectId == null ? null : (names.get(job.projectId) ?? null),
        status: job.status,
        error: job.status === "failed" ? job.error : null,
        createdAt: job.createdAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
        expiresAt: reportExpiresAt(job)?.toISOString() ?? null,
        includesMoney: job.includesMoney,
        progressReport: progress,
        files,
        retryHref: retries ? `${base}/${job.id}/retry` : null,
        deleteHref: deletes ? `${base}/${job.id}/delete` : null,
      };
    });
  },
};

/**
 * Every source Downloads merges. Append-only: CM-906 adds its backup and
 * data-export sources here.
 */
export function downloadSources(): DownloadSource[] {
  return [reportDownloadSource];
}
