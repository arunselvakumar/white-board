import { queryOptions } from "@tanstack/react-query";

import type { QuoteConstructionOrganizationCheckoutRequestModel } from "@/app/api/construction/organization/subscription/checkout/quote/quote-checkout-request-model";
import type { QuoteConstructionOrganizationCheckoutResponseModel } from "@/app/api/construction/organization/subscription/checkout/quote/quote-checkout-response-model";
import type { StartConstructionOrganizationCheckoutRequestModel } from "@/app/api/construction/organization/subscription/checkout/start-checkout-request-model";
import type { StartConstructionOrganizationCheckoutResponseModel } from "@/app/api/construction/organization/subscription/checkout/start-checkout-response-model";
import type { VerifyConstructionOrganizationCheckoutRequestModel } from "@/app/api/construction/organization/subscription/checkout/verify/verify-checkout-request-model";
import type { VerifyConstructionOrganizationCheckoutResponseModel } from "@/app/api/construction/organization/subscription/checkout/verify/verify-checkout-response-model";
import type { GetConstructionOrganizationSubscriptionResponseModel } from "@/app/api/construction/organization/subscription/get-subscription-response-model";
import type { ListConstructionOrganizationInvoicesResponseModel } from "@/app/api/construction/organization/subscription/invoices/list-invoices-response-model";
import type { ListConstructionOrganizationPlansResponseModel } from "@/app/api/construction/organization/subscription/plans/list-plans-response-model";

import { apiJson } from "./http";

export const SUBSCRIPTION_BASE = "/api/construction/organization/subscription";

export type SubscriptionView =
  GetConstructionOrganizationSubscriptionResponseModel;
export type PlansView = ListConstructionOrganizationPlansResponseModel;
export type QuoteView = QuoteConstructionOrganizationCheckoutResponseModel;
export type InvoicesPage = ListConstructionOrganizationInvoicesResponseModel;

export const subscriptionQuery = queryOptions({
  queryKey: ["organization", "subscription"],
  queryFn: () => apiJson<SubscriptionView>(SUBSCRIPTION_BASE),
});

export const plansQuery = queryOptions({
  queryKey: ["organization", "subscription", "plans"],
  queryFn: () => apiJson<PlansView>(`${SUBSCRIPTION_BASE}/plans`),
});

export const invoicesQuery = queryOptions({
  queryKey: ["organization", "subscription", "invoices"],
  queryFn: () =>
    apiJson<InvoicesPage>(`${SUBSCRIPTION_BASE}/invoices?limit=50`),
});

const postJson = <T>(path: string, body: unknown): Promise<T> =>
  apiJson<T>(`${SUBSCRIPTION_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export function quoteCheckout(
  input: QuoteConstructionOrganizationCheckoutRequestModel,
): Promise<QuoteView> {
  return postJson("/checkout/quote", input);
}

export function startCheckout(
  input: StartConstructionOrganizationCheckoutRequestModel,
): Promise<StartConstructionOrganizationCheckoutResponseModel> {
  return postJson("/checkout", input);
}

export function verifyCheckout(
  input: VerifyConstructionOrganizationCheckoutRequestModel,
): Promise<VerifyConstructionOrganizationCheckoutResponseModel> {
  return postJson("/checkout/verify", input);
}
