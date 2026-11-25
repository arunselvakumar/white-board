import { queryOptions } from "@tanstack/react-query";

import type { CentreDashboardView } from "@/src/preschool/application/dashboard-views";
import type { HeadOfficeView } from "@/src/preschool/application/head-office-views";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolCentreDashboard = CentreDashboardView;
export type PreschoolHeadOffice = HeadOfficeView;

export const preschoolDashboardKeys = {
  all: [...preschoolKeys.all, "dashboard"] as const,
  centre: (centreId: string) =>
    [...preschoolDashboardKeys.all, "centre", centreId] as const,
  headOffice: (month: string | undefined) =>
    [...preschoolDashboardKeys.all, "head-office", month ?? null] as const,
};

/** The Centre Dashboard for today. */
export function preschoolCentreDashboardQueryOptions(centreId: string) {
  return queryOptions({
    queryKey: preschoolDashboardKeys.centre(centreId),
    queryFn: ({ meta }) =>
      apiJson<PreschoolCentreDashboard>(
        `/api/preschool/dashboard?${new URLSearchParams({ centreId }).toString()}`,
        {},
        meta,
      ),
  });
}

/** Every Centre side by side; `month` is YYYY-MM, this month when left out. */
export function preschoolHeadOfficeQueryOptions(month?: string) {
  return queryOptions({
    queryKey: preschoolDashboardKeys.headOffice(month),
    queryFn: ({ meta }) =>
      apiJson<PreschoolHeadOffice>(
        `/api/preschool/dashboard/head-office${month == null ? "" : `?month=${month}`}`,
        {},
        meta,
      ),
  });
}
