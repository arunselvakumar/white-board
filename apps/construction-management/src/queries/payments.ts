import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionLabourWagePaymentResponseModel,
  ListConstructionLabourPaymentPayersResponseModel,
  ListConstructionLabourWagePaymentsResponseModel,
  RecordConstructionLabourWagePaymentRequestModel,
} from "@/app/api/construction/labour/payments/payment-models";

import { BALANCES_KEY, type PaymentPartyType } from "./balances";
import { apiJson } from "./http";

export type WagePayment = ConstructionLabourWagePaymentResponseModel;
export type WagePaymentPage = ListConstructionLabourWagePaymentsResponseModel;
export type RecordWagePaymentInput =
  RecordConstructionLabourWagePaymentRequestModel;
export type PaymentPayers = ListConstructionLabourPaymentPayersResponseModel;

export const PAYMENTS_API = "/api/construction/labour/payments";

/** Every payment query key starts here. */
export const PAYMENTS_KEY = ["labour", "payments"] as const;

export type PaymentListFilter = {
  projectId: string;
  partyType: PaymentPartyType | null;
  kind: "payment" | "advance" | null;
  from: string;
  to: string;
  cursor: { after: string } | { before: string } | null;
};

export function paymentsQuery(filter: PaymentListFilter) {
  const query = new URLSearchParams({ projectId: filter.projectId });
  if (filter.partyType != null) query.set("partyType", filter.partyType);
  if (filter.kind != null) query.set("kind", filter.kind);
  if (filter.from !== "") query.set("from", filter.from);
  if (filter.to !== "") query.set("to", filter.to);
  if (filter.cursor != null) {
    if ("after" in filter.cursor) query.set("after", filter.cursor.after);
    else query.set("before", filter.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...PAYMENTS_KEY, "list", text],
    queryFn: () => apiJson<WagePaymentPage>(`${PAYMENTS_API}?${text}`),
  });
}

export function paymentPayersQuery(
  projectId: string,
  partyType: PaymentPartyType,
) {
  const query = new URLSearchParams({ projectId, partyType }).toString();
  return queryOptions({
    queryKey: [...PAYMENTS_KEY, "payers", query],
    queryFn: () => apiJson<PaymentPayers>(`${PAYMENTS_API}/payers?${query}`),
  });
}

export function recordPayment(
  input: RecordWagePaymentInput,
): Promise<WagePayment> {
  return apiJson(PAYMENTS_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function cancelPayment(input: {
  id: string;
  expectedUpdatedAt: string;
}): Promise<void> {
  return apiJson(`${PAYMENTS_API}/${encodeURIComponent(input.id)}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedUpdatedAt: input.expectedUpdatedAt }),
  });
}

/** The receipt is the raw file body with its own content type. */
export function attachReceipt(id: string, file: File): Promise<WagePayment> {
  return apiJson(`${PAYMENTS_API}/${encodeURIComponent(id)}/receipt`, {
    method: "POST",
    headers: { "content-type": file.type || "application/octet-stream" },
    body: file,
  });
}

/** Payments change balances and statements too. */
function useInvalidatePayments() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: PAYMENTS_KEY }),
      client.invalidateQueries({ queryKey: BALANCES_KEY }),
    ]);
}

/**
 * Records a payment, then uploads its receipt if one was chosen. A failed
 * upload leaves the payment recorded and reports `receiptError`.
 */
export function useRecordPayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: async ({
      input,
      receipt,
    }: {
      input: RecordWagePaymentInput;
      receipt: File | null;
    }): Promise<{ payment: WagePayment; receiptError: unknown }> => {
      const payment = await recordPayment(input);
      if (receipt == null) return { payment, receiptError: null };
      try {
        return {
          payment: await attachReceipt(payment.id, receipt),
          receiptError: null,
        };
      } catch (error) {
        return { payment, receiptError: error };
      }
    },
    onSettled: invalidate,
  });
}

export function useCancelPayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({ mutationFn: cancelPayment, onSettled: invalidate });
}
