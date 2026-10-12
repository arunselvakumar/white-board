import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionFinanceDashboardResponseModel } from "@/app/api/construction/finance/dashboard/dashboard-models";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { apiJson } from "./http";

export type FinanceDashboard = GetConstructionFinanceDashboardResponseModel;
export type PaymentsDashboard = NonNullable<FinanceDashboard["payments"]>;

export const FINANCE_DASHBOARD_API = `${FINANCE_API}/dashboard`;

/**
 * The Project Dashboard's Payments section and Payment Approvals KPI
 * (CM-709). Invalidated with every finance key.
 */
export function financeDashboardQuery(
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
      ...FINANCE_KEY,
      "dashboard",
      projectId,
      range.from,
      range.to,
    ] as const,
    queryFn: () =>
      apiJson<FinanceDashboard>(`${FINANCE_DASHBOARD_API}?${query}`),
  });
}
