import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionHrmsDashboardResponseModel } from "@/app/api/construction/hrms/dashboard/dashboard-models";

import { HRMS_KEY } from "./hrms-settings";
import { apiJson } from "./http";

export type HrmsDashboardModel = GetConstructionHrmsDashboardResponseModel;

/** The HRMS Dashboard (CM-319): the sections the caller may see. */
export const hrmsDashboardQuery = queryOptions({
  queryKey: [...HRMS_KEY, "dashboard"],
  queryFn: () =>
    apiJson<HrmsDashboardModel>("/api/construction/hrms/dashboard"),
});
