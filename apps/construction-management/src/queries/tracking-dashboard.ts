import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionTrackingDashboardResponseModel } from "@/app/api/construction/tracking/dashboard/dashboard-models";

import { apiJson } from "./http";
import { TRACKING_API, TRACKING_KEY } from "./tracking-access";

export type TrackingDashboard = GetConstructionTrackingDashboardResponseModel;
export type TaskDashboard = NonNullable<TrackingDashboard["tasks"]>;
export type IssueDashboard = NonNullable<TrackingDashboard["issues"]>;
export type InspectionDashboard = NonNullable<TrackingDashboard["inspections"]>;

export const TRACKING_DASHBOARD_API = `${TRACKING_API}/dashboard`;

/**
 * The Project Dashboard's Task, Issue & Snag and Inspection Request
 * sections and their KPI tiles (CM-805). Invalidated with every tracking
 * key.
 */
export function trackingDashboardQuery(
  projectId: string,
  range: { from: string; to: string },
) {
  const query = new URLSearchParams({
    projectId,
    from: range.from,
    to: range.to,
  }).toString();
  return queryOptions({
    queryKey: [
      ...TRACKING_KEY,
      "dashboard",
      projectId,
      range.from,
      range.to,
    ] as const,
    queryFn: () =>
      apiJson<TrackingDashboard>(`${TRACKING_DASHBOARD_API}?${query}`),
  });
}
