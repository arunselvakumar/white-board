import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionProcurementDashboardResponseModel } from "@/app/api/construction/procurement/dashboard/dashboard-models";
import type { Duration } from "@/lib/dashboard-duration";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";

export type ProcurementDashboard =
  GetConstructionProcurementDashboardResponseModel;

/** The Project Dashboard's Materials section and Material Approvals KPI (CM-510). */
export function procurementDashboardQuery(
  projectId: string,
  duration: Duration,
) {
  const query = new URLSearchParams({
    projectId,
    from: duration.from,
    to: duration.to,
  });
  return queryOptions({
    queryKey: [
      ...PROCUREMENT_KEY,
      "dashboard",
      projectId,
      duration.from,
      duration.to,
    ] as const,
    queryFn: () =>
      apiJson<ProcurementDashboard>(
        `${PROCUREMENT_API}/dashboard?${query.toString()}`,
      ),
  });
}
