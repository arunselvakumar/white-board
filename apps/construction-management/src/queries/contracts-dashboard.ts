import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionContractsDashboardResponseModel } from "@/app/api/construction/contracts/dashboard/dashboard-models";

import { CONTRACTS_API, CONTRACTS_KEY } from "./contracts-access";
import { apiJson } from "./http";

export type ContractsDashboard = GetConstructionContractsDashboardResponseModel;

/**
 * The Project Dashboard's Contracts section (CM-1111): a snapshot as on
 * today, so it takes no duration. Under the contracts key, so bill and
 * Work Order writes that refresh contracts refresh it.
 */
export function contractsDashboardQuery(projectId: string) {
  return queryOptions({
    queryKey: [...CONTRACTS_KEY, "dashboard", projectId] as const,
    queryFn: () =>
      apiJson<ContractsDashboard>(
        `${CONTRACTS_API}/dashboard?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}
