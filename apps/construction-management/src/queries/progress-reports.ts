import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionSiteWorkProgressReportResponse,
  CreateConstructionSiteWorkProgressReportRequestModel,
  GetConstructionSiteWorkProgressReportFormOptionsResponse,
  ListConstructionSiteWorkProgressReportsResponse,
} from "@/app/api/construction/site-work/progress-reports/progress-report-models";

import { apiJson } from "./http";
import { SITE_WORK_API, SITE_WORK_KEY } from "./site-work-access";

export type ProgressReport = ConstructionSiteWorkProgressReportResponse;
export type ProgressReportList =
  ListConstructionSiteWorkProgressReportsResponse;
export type ProgressReportFormOptions =
  GetConstructionSiteWorkProgressReportFormOptionsResponse;
export type CreateProgressReportInput = z.input<
  typeof CreateConstructionSiteWorkProgressReportRequestModel
>;

export const PROGRESS_REPORTS_API = `${SITE_WORK_API}/progress-reports`;
/** Every Progress Reports read; writes invalidate it (CM-606). */
export const PROGRESS_REPORTS_KEY = [
  ...SITE_WORK_KEY,
  "progress-reports",
] as const;

export function isPreparing(report: ProgressReport): boolean {
  return report.status === "queued" || report.status === "running";
}

/**
 * A Project's Daily Progress Reports, newest first. While one is queued
 * or running (once M9 moves jobs onto a queue) the list polls every 3
 * seconds, as the Reports page does.
 */
export function progressReportsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...PROGRESS_REPORTS_KEY, "list", projectId],
    queryFn: () =>
      apiJson<ProgressReportList>(
        `${PROGRESS_REPORTS_API}?${new URLSearchParams({ projectId }).toString()}`,
      ),
    refetchInterval: (query) =>
      query.state.data?.items.some(isPreparing) === true ? 3_000 : false,
  });
}

/** Today, the Team Members for Report Filled By, and the report types. */
export function progressReportFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...PROGRESS_REPORTS_KEY, "form-options", projectId],
    queryFn: () =>
      apiJson<ProgressReportFormOptions>(
        `${PROGRESS_REPORTS_API}/form-options?${new URLSearchParams({ projectId }).toString()}`,
      ),
  });
}

function useInvalidate(projectId: string) {
  const client = useQueryClient();
  return () =>
    client.invalidateQueries({
      queryKey: [...PROGRESS_REPORTS_KEY, "list", projectId],
    });
}

/**
 * Generates a Daily Progress Report and refreshes the list. The job is
 * listed (Preparing) while it runs, so the list is read again a moment
 * after the request goes out, then polls until it is done.
 */
export function useCreateProgressReport(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    onMutate: () => {
      setTimeout(() => {
        void invalidate();
      }, 1_000);
    },
    mutationFn: (input: CreateProgressReportInput) =>
      apiJson<ProgressReport>(PROGRESS_REPORTS_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSettled: invalidate,
  });
}

/** Runs a failed report again. */
export function useRetryProgressReport(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiJson<ProgressReport>(
        `${PROGRESS_REPORTS_API}/${encodeURIComponent(id)}/retry`,
        { method: "POST" },
      ),
    onSettled: invalidate,
  });
}

/** Deletes a report and its PDF. */
export function useDeleteProgressReport(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiJson<null>(
        `${PROGRESS_REPORTS_API}/${encodeURIComponent(id)}/delete`,
        { method: "POST" },
      ),
    onSettled: invalidate,
  });
}
