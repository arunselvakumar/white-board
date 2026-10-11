import { queryOptions } from "@tanstack/react-query";

import type {
  CounterpartyKindModel,
  GetConstructionFinanceCounterpartyOptionsResponseModel,
  GetConstructionFinancePaymentCategoryOptionsResponseModel,
} from "@/app/api/construction/finance/lookup-models";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { apiJson } from "./http";

/** Invalidate after a Payment Category changes. */
export const PAYMENT_CATEGORIES_KEY = [
  ...FINANCE_KEY,
  "payment-categories",
] as const;

export function paymentCategoryOptionsQuery() {
  return queryOptions({
    queryKey: [...PAYMENT_CATEGORIES_KEY, "options"] as const,
    queryFn: () =>
      apiJson<GetConstructionFinancePaymentCategoryOptionsResponseModel>(
        `${FINANCE_API}/payment-categories/options`,
      ),
    staleTime: 60_000,
  });
}

export function counterpartyOptionsQuery(
  kind: CounterpartyKindModel,
  projectId: string | null,
) {
  const params = new URLSearchParams({ kind });
  if (projectId != null) params.set("projectId", projectId);
  return queryOptions({
    queryKey: [...FINANCE_KEY, "counterparties", kind, projectId] as const,
    queryFn: () =>
      apiJson<GetConstructionFinanceCounterpartyOptionsResponseModel>(
        `${FINANCE_API}/counterparties/options?${params.toString()}`,
      ),
    staleTime: 60_000,
  });
}
