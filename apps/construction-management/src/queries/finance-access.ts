import { queryOptions } from "@tanstack/react-query";

import type {
  FinanceAccessMenu,
  GetConstructionFinanceAccessResponseModel,
} from "@/app/api/construction/finance/access/access-models";
import type { Flag } from "@/src/shared-kernel/access";

import { apiJson } from "./http";

export type FinanceAccess = GetConstructionFinanceAccessResponseModel;

export const FINANCE_API = "/api/construction/finance";

/** Every finance query key starts here (M7). */
export const FINANCE_KEY = ["finance"] as const;

/**
 * What the viewer may do in finance, on a Project when given (Company
 * menus otherwise). Screens hide actions by it; routes check again.
 */
export function financeAccessQuery(projectId: string | null) {
  return queryOptions({
    queryKey: [...FINANCE_KEY, "access", projectId ?? "company"] as const,
    queryFn: () =>
      apiJson<FinanceAccess>(
        `${FINANCE_API}/access${projectId == null ? "" : `?projectId=${encodeURIComponent(projectId)}`}`,
      ),
    staleTime: 60_000,
  });
}

export function canInFinance(
  access: FinanceAccess,
  menu: FinanceAccessMenu,
  flag: Flag,
): boolean {
  return access.menus[menu].includes(flag);
}
