import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionFinanceAccountOptionsResponseModel } from "@/app/api/construction/finance/accounts/account-models";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { apiJson } from "./http";

export type AccountOption =
  GetConstructionFinanceAccountOptionsResponseModel["items"][number];

/** Every account query key starts here; invalidate it after an account changes. */
export const FINANCE_ACCOUNTS_KEY = [...FINANCE_KEY, "accounts"] as const;

/** The accounts the viewer may pay from or receive into (the account picker). */
export function accountOptionsQuery() {
  return queryOptions({
    queryKey: [...FINANCE_ACCOUNTS_KEY, "options"] as const,
    queryFn: () =>
      apiJson<GetConstructionFinanceAccountOptionsResponseModel>(
        `${FINANCE_API}/accounts/options`,
      ),
    staleTime: 30_000,
  });
}
