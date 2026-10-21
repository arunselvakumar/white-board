import { queryOptions } from "@tanstack/react-query";

import type {
  ContractsAccessMenu,
  GetConstructionContractsAccessResponseModel,
} from "@/app/api/construction/contracts/access/access-models";
import type { Flag } from "@/src/shared-kernel/access";

import { apiJson } from "./http";

export type ContractsAccess = GetConstructionContractsAccessResponseModel;

export const CONTRACTS_API = "/api/construction/contracts";

/** Every contracts query key starts here (M11). */
export const CONTRACTS_KEY = ["contracts"] as const;

/**
 * What the viewer may do in contracts on a Project. Screens hide actions by
 * it; routes check again.
 */
export function contractsAccessQuery(projectId: string) {
  return queryOptions({
    queryKey: [...CONTRACTS_KEY, "access", projectId] as const,
    queryFn: () =>
      apiJson<ContractsAccess>(
        `${CONTRACTS_API}/access?projectId=${encodeURIComponent(projectId)}`,
      ),
    staleTime: 60_000,
  });
}

export function canInContracts(
  access: ContractsAccess,
  menu: ContractsAccessMenu,
  flag: Flag,
): boolean {
  return access.menus[menu].includes(flag);
}
