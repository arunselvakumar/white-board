import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { ConstructionProjectsDashboardLayoutResponseModel } from "@/app/api/construction/projects/dashboard-layout/dashboard-layout-models";
import type { ConstructionProjectsProjectSummaryResponseModel } from "@/app/api/construction/projects/projects/[id]/dashboard/dashboard-models";

import { apiJson } from "./http";
import {
  LABOUR_SUMMARY_API,
  type ProjectLabourSummary,
} from "./labour-summary";
import { PROJECTS_API, PROJECTS_KEY } from "./projects";

export type DashboardLayout = ConstructionProjectsDashboardLayoutResponseModel;
export type DashboardSection = DashboardLayout["sections"][number];
export type ProjectSummary = ConstructionProjectsProjectSummaryResponseModel;

const LAYOUT_API = "/api/construction/projects/dashboard-layout";

const LAYOUT_KEY = [...PROJECTS_KEY, "dashboard-layout"] as const;

/**
 * The member's dashboard sections in order (CM-412), for every Project;
 * on a Project, the sections whose module is hidden there are marked
 * (CM-902).
 */
export function dashboardLayoutQuery(projectId: string | null) {
  return queryOptions({
    queryKey: [...LAYOUT_KEY, projectId ?? "all"],
    queryFn: () =>
      apiJson<DashboardLayout>(
        projectId == null
          ? LAYOUT_API
          : `${LAYOUT_API}?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

/**
 * Manage Dashboard: the sections in order with what shows; `[]` resets.
 * Every cached layout takes the new order and keeps its Project's hidden
 * marks.
 */
export function useSaveDashboardLayout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sections: { key: string; visible: boolean }[]) =>
      apiJson<DashboardLayout>(`${LAYOUT_API}/update`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sections }),
      }),
    onSuccess: (layout) => {
      queryClient.setQueriesData<DashboardLayout>(
        { queryKey: LAYOUT_KEY },
        (old) => ({
          sections: layout.sections.map((section) => ({
            ...section,
            hiddenOnProject:
              old?.sections.find((item) => item.key === section.key)
                ?.hiddenOnProject ?? false,
          })),
        }),
      );
    },
  });
}

/** The dashboard's Project summary: details, budget and counts. */
export function projectSummaryQuery(projectId: string) {
  return queryOptions({
    queryKey: [...PROJECTS_KEY, "dashboard-summary", projectId],
    queryFn: () =>
      apiJson<ProjectSummary>(
        `${PROJECTS_API}/${encodeURIComponent(projectId)}/dashboard/summary`,
      ),
  });
}

/**
 * The labour summary over the dashboard's duration: counts on `to`, the
 * day-wise series from `from` (the labour context's route, CM-219).
 */
export function dashboardAttendanceQuery(
  projectId: string,
  range: { from: string; to: string },
) {
  return queryOptions({
    queryKey: ["labour", "summary", projectId, range.from, range.to],
    queryFn: () =>
      apiJson<ProjectLabourSummary>(
        `${LABOUR_SUMMARY_API}?${new URLSearchParams({
          projectId,
          from: range.from,
          date: range.to,
        }).toString()}`,
      ),
  });
}
