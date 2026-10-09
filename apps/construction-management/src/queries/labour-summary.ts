import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionLabourProjectSummaryResponseModel } from "@/app/api/construction/labour/summary/summary-models";

import { apiJson } from "./http";

export type ProjectLabourSummary =
  GetConstructionLabourProjectSummaryResponseModel;

export const LABOUR_SUMMARY_API = "/api/construction/labour/summary";

/** The labour tiles on a Project's Overview (CM-219). */
export function projectLabourSummaryQuery(projectId: string) {
  return queryOptions({
    queryKey: ["labour", "summary", projectId],
    queryFn: () =>
      apiJson<ProjectLabourSummary>(
        `${LABOUR_SUMMARY_API}?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}
