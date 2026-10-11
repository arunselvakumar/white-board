import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionFinancePaymentCategoryResponseModel,
  ListConstructionFinancePaymentCategoriesResponseModel,
} from "@/app/api/construction/finance/payment-categories/payment-category-models";

import { FINANCE_API } from "./finance-access";
import { PAYMENT_CATEGORIES_KEY } from "./finance-lookups";
import { apiJson } from "./http";

export type PaymentCategoryItem =
  ConstructionFinancePaymentCategoryResponseModel;

export const PAYMENT_CATEGORIES_API = `${FINANCE_API}/payment-categories`;

/** Masters → Payment Categories: every live category, disabled ones too. */
export function paymentCategoriesQuery() {
  return queryOptions({
    queryKey: [...PAYMENT_CATEGORIES_KEY, "list"] as const,
    queryFn: () =>
      apiJson<ListConstructionFinancePaymentCategoriesResponseModel>(
        PAYMENT_CATEGORIES_API,
      ),
  });
}

export type PaymentCategoryCommand =
  | { kind: "create"; name: string }
  | { kind: "update"; id: string; name: string; expectedUpdatedAt: string }
  | { kind: "disable" | "enable" | "delete"; id: string };

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function runPaymentCategoryCommand(
  command: PaymentCategoryCommand,
): Promise<PaymentCategoryItem | undefined> {
  switch (command.kind) {
    case "create":
      return postJson(PAYMENT_CATEGORIES_API, { name: command.name });
    case "update":
      return postJson(
        `${PAYMENT_CATEGORIES_API}/${encodeURIComponent(command.id)}/update`,
        { name: command.name, expectedUpdatedAt: command.expectedUpdatedAt },
      );
    default:
      return postJson(
        `${PAYMENT_CATEGORIES_API}/${encodeURIComponent(command.id)}/${command.kind}`,
      );
  }
}

/**
 * Add, rename, disable, enable and delete a Payment Category; refreshes
 * the master and every money form's picker (`PAYMENT_CATEGORIES_KEY`).
 */
export function usePaymentCategoryCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runPaymentCategoryCommand,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: PAYMENT_CATEGORIES_KEY }),
  });
}
