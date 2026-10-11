import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionReportingReportJobResponseModel,
  ListConstructionReportingReportsResponseModel,
  RequestConstructionReportingReportRequestModel,
} from "@/app/api/construction/reporting/reports/report-models";

import { apiJson } from "./http";

export type ReportJob = ConstructionReportingReportJobResponseModel;
export type ReportJobList = ListConstructionReportingReportsResponseModel;
export type RequestReportInput = RequestConstructionReportingReportRequestModel;
export type ReportKind = ReportJob["kind"];

export const REPORTS_API = "/api/construction/reporting/reports";

/** Every report query key starts here. */
export const REPORTS_KEY = ["reporting", "reports"] as const;

function isPending(job: ReportJob): boolean {
  return job.status === "queued" || job.status === "running";
}

function listKey(projectId: string | null) {
  return projectId == null
    ? ([...REPORTS_KEY, "central"] as const)
    : ([...REPORTS_KEY, "project", projectId] as const);
}

/**
 * The newest reports of a Project, or with `null` the viewer's own central
 * reports. While one is queued or running (once M9 moves jobs onto a
 * queue) the list polls every 3 seconds.
 */
export function reportsQuery(projectId: string | null) {
  return queryOptions({
    queryKey: listKey(projectId),
    queryFn: () =>
      apiJson<ReportJobList>(
        projectId == null
          ? REPORTS_API
          : `${REPORTS_API}?${new URLSearchParams({ projectId }).toString()}`,
      ),
    refetchInterval: (query) =>
      query.state.data?.items.some(isPending) === true ? 3_000 : false,
  });
}

export function requestReport(input: RequestReportInput): Promise<ReportJob> {
  return apiJson<ReportJob>(REPORTS_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** Requests a report and refreshes the Project's (or the central) recent reports. */
export function useRequestReport(projectId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: requestReport,
    onSettled: () => client.invalidateQueries({ queryKey: listKey(projectId) }),
  });
}
