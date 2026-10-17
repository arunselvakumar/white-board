import { queryOptions } from "@tanstack/react-query";

import type {
  GetConstructionSalesAccessResponseModel,
  SalesAccessMenu,
} from "@/app/api/construction/sales/access/access-models";
import type { Flag } from "@/src/shared-kernel/access";

import { apiJson } from "./http";

export type SalesAccess = GetConstructionSalesAccessResponseModel;

export const SALES_API = "/api/construction/sales";

/** Every sales query key starts here (M10). */
export const SALES_KEY = ["sales"] as const;

/**
 * What the viewer may do in sales on a Project. Screens hide actions by it;
 * routes check again.
 */
export function salesAccessQuery(projectId: string) {
  return queryOptions({
    queryKey: [...SALES_KEY, "access", projectId] as const,
    queryFn: () =>
      apiJson<SalesAccess>(
        `${SALES_API}/access?projectId=${encodeURIComponent(projectId)}`,
      ),
    staleTime: 60_000,
  });
}

export function canInSales(
  access: SalesAccess,
  menu: SalesAccessMenu,
  flag: Flag,
): boolean {
  return access.menus[menu].includes(flag);
}
