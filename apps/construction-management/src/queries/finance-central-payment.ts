import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionFinanceCentralPaymentResponseModel } from "@/app/api/construction/finance/central-payment/central-payment-models";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { apiJson } from "./http";

export type CentralPaymentSummary =
  GetConstructionFinanceCentralPaymentResponseModel;
export type CentralPartyDue =
  CentralPaymentSummary["parties"]["contractor"][number];

export const CENTRAL_PAYMENT_API = `${FINANCE_API}/central-payment`;

/** Central Payment in the Workspace (CM-709). */
export const centralPaymentQuery = queryOptions({
  queryKey: [...FINANCE_KEY, "central-payment"] as const,
  queryFn: () => apiJson<CentralPaymentSummary>(CENTRAL_PAYMENT_API),
});
