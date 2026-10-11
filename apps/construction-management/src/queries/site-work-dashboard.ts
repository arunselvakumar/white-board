import { queryOptions } from "@tanstack/react-query";

import type {
  GetConstructionSiteWorkDailyWorkDashboardResponseModel,
  GetConstructionSiteWorkEquipmentUsageDashboardResponseModel,
} from "@/app/api/construction/site-work/dashboard/dashboard-models";

import { apiJson } from "./http";
import { SITE_WORK_API, SITE_WORK_KEY } from "./site-work-access";

export type DailyWorkDashboard =
  GetConstructionSiteWorkDailyWorkDashboardResponseModel;
export type EquipmentUsageDashboard =
  GetConstructionSiteWorkEquipmentUsageDashboardResponseModel;

export const SITE_WORK_DASHBOARD_API = `${SITE_WORK_API}/dashboard`;

function query(projectId: string, range: { from: string; to: string }) {
  return new URLSearchParams({
    projectId,
    from: range.from,
    to: range.to,
  }).toString();
}

/** The Project Dashboard's Daily Work section (CM-608). */
export function dailyWorkDashboardQuery(
  projectId: string,
  range: { from: string; to: string },
) {
  return queryOptions({
    queryKey: [
      ...SITE_WORK_KEY,
      "dashboard",
      "daily-work",
      projectId,
      range.from,
      range.to,
    ] as const,
    queryFn: () =>
      apiJson<DailyWorkDashboard>(
        `${SITE_WORK_DASHBOARD_API}/daily-work?${query(projectId, range)}`,
      ),
  });
}

/** The Project Dashboard's Equipment Usage section (CM-608). */
export function equipmentUsageDashboardQuery(
  projectId: string,
  range: { from: string; to: string },
) {
  return queryOptions({
    queryKey: [
      ...SITE_WORK_KEY,
      "dashboard",
      "equipment-usage",
      projectId,
      range.from,
      range.to,
    ] as const,
    queryFn: () =>
      apiJson<EquipmentUsageDashboard>(
        `${SITE_WORK_DASHBOARD_API}/equipment-usage?${query(projectId, range)}`,
      ),
  });
}
