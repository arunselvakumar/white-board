import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import type { ReportBody } from "../domain/report-document";
import type { ReportJob, ReportParams } from "../domain/report-job";
import {
  buildInspectionRequestReport,
  buildIssueSnagReport,
  buildTaskReport,
} from "../domain/tracking-reports";
import type { TrackingReportSource } from "./ports";

export type TrackingReportParams = Extract<
  ReportParams,
  { kind: "task_report" | "issue_snag_report" | "inspection_request_report" }
>;

/** The tracking table reports (CM-805). */
export const TRACKING_TABLE_KINDS: readonly ReportJob["kind"][] = [
  "task_report",
  "issue_snag_report",
  "inspection_request_report",
];

/** Wide tracking registers print on A3. */
export const TRACKING_A3_KINDS = TRACKING_TABLE_KINDS;

/** The body of a tracking report (CM-805). */
export async function trackingReportBody(
  job: ReportJob,
  params: TrackingReportParams,
  source: TrackingReportSource | undefined,
  /** The Company's today: statuses and variance are as on it. */
  today: CalendarDate,
): Promise<ReportBody> {
  if (source == null)
    throw new Error("The tracking report source is not wired.");
  const range = { from: params.from, to: params.to };
  const projectId = job.projectId ?? "";
  switch (params.kind) {
    case "task_report":
      return buildTaskReport({
        tasks: await source.tasks(job.workspaceId, projectId, {
          range,
          own: params.own,
          financial: job.includesMoney,
          today,
        }),
        financial: job.includesMoney,
        own: params.own != null,
        today,
      });
    case "issue_snag_report":
      return buildIssueSnagReport({
        issues: await source.issues(job.workspaceId, projectId, {
          range,
          own: params.own,
          today,
        }),
        own: params.own != null,
        today,
      });
    case "inspection_request_report":
      return buildInspectionRequestReport({
        inspections: await source.inspections(job.workspaceId, projectId, {
          range,
        }),
      });
  }
}
