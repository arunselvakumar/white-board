import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionReportingCompanyDashboardResponseModel } from "@/app/api/construction/reporting/company-dashboard/company-dashboard-models";

import { apiJson } from "./http";

export type CompanyDashboard =
  GetConstructionReportingCompanyDashboardResponseModel;
export type CompanyDashboardProject = CompanyDashboard["projects"][number];

export const COMPANY_DASHBOARD_API =
  "/api/construction/reporting/company-dashboard";

/** Every Company Dashboard key starts here. */
export const COMPANY_DASHBOARD_KEY = [
  "reporting",
  "company-dashboard",
] as const;

/**
 * The Company Dashboard over a duration (CM-902): totals and one row per
 * Project the member can see.
 */
export function companyDashboardQuery(range: { from: string; to: string }) {
  const query = new URLSearchParams({
    from: range.from,
    to: range.to,
  }).toString();
  return queryOptions({
    queryKey: [...COMPANY_DASHBOARD_KEY, range.from, range.to] as const,
    queryFn: () =>
      apiJson<CompanyDashboard>(`${COMPANY_DASHBOARD_API}?${query}`),
  });
}
