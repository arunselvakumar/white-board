import { z } from "zod";

import type { ProgressReportView } from "@/src/site-work/application/progress-report-handlers";
import type { SiteRecordTeamMember } from "@/src/site-work/application/ports";
import { PROGRESS_REPORT_TYPES } from "@/src/site-work/domain/progress-report";

export const PROGRESS_REPORTS_PATH =
  "/api/construction/site-work/progress-reports";

// Requests

export const CreateConstructionSiteWorkProgressReportRequestModel = z
  .object({
    projectId: z.uuid(),
    /** `YYYY-MM-DD`, not after the Company's today. */
    date: z.iso.date(),
    /** A Team Member of the Project (User id): only their worksheets and usage sheets. */
    filledBy: z.string().trim().min(1).max(64).nullish(),
    /** Photos of the day's worksheets, usage sheets and Site Diary, at most 60. */
    includeImages: z.boolean().optional(),
  })
  .meta({
    description:
      "Generate a Daily Progress Report: takes or reuses the date's DPR number and queues the job (it runs inline until M9).",
  });
export type CreateConstructionSiteWorkProgressReportRequestModel = z.infer<
  typeof CreateConstructionSiteWorkProgressReportRequestModel
>;

export const ListConstructionSiteWorkProgressReportsRequestModel = z.object({
  projectId: z.uuid(),
});

export const GetConstructionSiteWorkProgressReportFormOptionsRequestModel =
  z.object({ projectId: z.uuid() });

export const ConstructionSiteWorkProgressReportParamsModel = z.object({
  id: z.uuid(),
});

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });

export const ConstructionSiteWorkProgressReportActionsResponseModel = z.object({
  /** Read, and Financial on Equipment Usage when it shows hire cost. */
  download: z.boolean(),
  /** Create, on a failed report. */
  retry: z.boolean(),
  delete: z.boolean(),
});

export const ConstructionSiteWorkProgressReportResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  kind: z.literal("daily_progress_report"),
  /** `DPR/26-27/00001`: one per Project per date. */
  number: z.string(),
  date: z.iso.date(),
  /** Null when the report covers every Team Member. */
  filledBy: person.nullable(),
  includeImages: z.boolean(),
  status: z.enum(["queued", "running", "done", "failed"]),
  /** Why a failed report failed. */
  error: z.string().nullable(),
  /** Prints hire cost (the requester held Financial on Equipment Usage). */
  includesMoney: z.boolean(),
  requestedBy: person,
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  /** The PDF link once done and the viewer may download it. */
  download: z.string().nullable(),
  actions: ConstructionSiteWorkProgressReportActionsResponseModel,
});
export type ConstructionSiteWorkProgressReportResponse = z.infer<
  typeof ConstructionSiteWorkProgressReportResponseModel
>;

export const ListConstructionSiteWorkProgressReportsResponseModel = z.object({
  items: z.array(ConstructionSiteWorkProgressReportResponseModel),
});
export type ListConstructionSiteWorkProgressReportsResponse = z.infer<
  typeof ListConstructionSiteWorkProgressReportsResponseModel
>;

export const GetConstructionSiteWorkProgressReportFormOptionsResponseModel =
  z.object({
    /** The Company's today: the latest date a DPR can be for. */
    today: z.iso.date(),
    /** Report Filled By: Team Members on the Project, and the Owner. */
    teamMembers: z.array(
      z.object({ userId: z.string(), name: z.string(), isOwner: z.boolean() }),
    ),
    /** Report types; the Task Progress Report comes with Tasks (M8). */
    types: z.array(
      z.object({
        key: z.enum(["daily_progress_report", "task_progress_report"]),
        label: z.string(),
        available: z.boolean(),
        note: z.string().nullable(),
      }),
    ),
  });
export type GetConstructionSiteWorkProgressReportFormOptionsResponse = z.infer<
  typeof GetConstructionSiteWorkProgressReportFormOptionsResponseModel
>;

export function progressReportDownloadPath(id: string): string {
  return `${PROGRESS_REPORTS_PATH}/${id}/download`;
}

export function toProgressReportResponse(
  report: ProgressReportView,
): ConstructionSiteWorkProgressReportResponse {
  return {
    id: report.id,
    projectId: report.projectId,
    kind: "daily_progress_report",
    number: report.number,
    date: report.date,
    filledBy:
      report.filledBy == null
        ? null
        : { userId: report.filledBy, name: report.filledByName },
    includeImages: report.includeImages,
    status: report.status,
    error: report.error,
    includesMoney: report.includesMoney,
    requestedBy: { userId: report.requestedBy, name: report.requestedByName },
    createdAt: report.createdAt.toISOString(),
    finishedAt: report.finishedAt?.toISOString() ?? null,
    download: report.canDownload ? progressReportDownloadPath(report.id) : null,
    actions: {
      download: report.canDownload,
      retry: report.canRetry,
      delete: report.canDelete,
    },
  };
}

export function toProgressReportFormOptions(options: {
  today: string;
  teamMembers: SiteRecordTeamMember[];
}): GetConstructionSiteWorkProgressReportFormOptionsResponse {
  return {
    today: options.today,
    teamMembers: options.teamMembers.map((member) => ({
      userId: member.userId,
      name: member.name,
      isOwner: member.isOwner,
    })),
    types: PROGRESS_REPORT_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      available: !("comingWith" in type),
      note: "comingWith" in type ? type.comingWith : null,
    })),
  };
}
