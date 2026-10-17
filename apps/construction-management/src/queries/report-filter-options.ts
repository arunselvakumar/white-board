import { queryOptions } from "@tanstack/react-query";

import type { ListConstructionReportingFilterOptionsResponseModel } from "@/app/api/construction/reporting/filter-options/filter-options-models";

import { apiJson } from "./http";
import { REPORTS_KEY } from "./reports";

export type ReportFilterOptions =
  ListConstructionReportingFilterOptionsResponseModel;

export const REPORT_FILTER_OPTIONS_API =
  "/api/construction/reporting/filter-options";

/**
 * The choices for the report cards' pickers on a Project, or with `null`
 * centrally (CM-903): the server reads only the pickers of the reports
 * the viewer may request.
 */
export function reportFilterOptionsQuery(projectId: string | null) {
  const query =
    projectId == null
      ? new URLSearchParams({ scope: "central" })
      : new URLSearchParams({ scope: "project", projectId });
  return queryOptions({
    queryKey: [
      ...REPORTS_KEY,
      "filter-options",
      projectId ?? "central",
    ] as const,
    queryFn: () =>
      apiJson<ReportFilterOptions>(
        `${REPORT_FILTER_OPTIONS_API}?${query.toString()}`,
      ),
    staleTime: 60_000,
  });
}
