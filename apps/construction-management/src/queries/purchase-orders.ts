import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  CreateConstructionProcurementPurchaseOrderRequestModel,
  GetConstructionProcurementPurchaseOrderFormOptionsResponseModel,
  GetConstructionProcurementPurchaseOrderResponseModel,
  ListConstructionProcurementPurchaseOrdersResponseModel,
  UpdateConstructionProcurementPurchaseOrderRequestModel,
} from "@/app/api/construction/procurement/purchase-orders/purchase-order-models";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";

export type PurchaseOrder =
  ListConstructionProcurementPurchaseOrdersResponseModel["items"][number];
export type PurchaseOrderDetail =
  GetConstructionProcurementPurchaseOrderResponseModel;
export type PurchaseOrderPage =
  ListConstructionProcurementPurchaseOrdersResponseModel;
export type PurchaseOrderFormOptions =
  GetConstructionProcurementPurchaseOrderFormOptionsResponseModel;
export type CreatePurchaseOrderInput = z.input<
  typeof CreateConstructionProcurementPurchaseOrderRequestModel
>;
export type UpdatePurchaseOrderInput = z.input<
  typeof UpdateConstructionProcurementPurchaseOrderRequestModel
>;

export const PURCHASE_ORDERS_API = `${PROCUREMENT_API}/purchase-orders`;

export const PURCHASE_ORDERS_KEY = [
  ...PROCUREMENT_KEY,
  "purchase-orders",
] as const;

export type PurchaseOrderFilter = {
  projectId: string;
  from?: string;
  to?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  receiptStatus?: "not_received" | "partially_received" | "received";
  supplierId?: string;
  purchaseRequestId?: string;
  cursor?: { after: string } | { before: string } | null;
};

export function purchaseOrdersQuery(filter: PurchaseOrderFilter) {
  const query = new URLSearchParams({ projectId: filter.projectId });
  for (const key of [
    "from",
    "to",
    "approvalStatus",
    "receiptStatus",
    "supplierId",
    "purchaseRequestId",
  ] as const) {
    const value = filter[key];
    if (value != null && value !== "") query.set(key, value);
  }
  if (filter.cursor != null) {
    if ("after" in filter.cursor) query.set("after", filter.cursor.after);
    else query.set("before", filter.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...PURCHASE_ORDERS_KEY, "list", text] as const,
    queryFn: () => apiJson<PurchaseOrderPage>(`${PURCHASE_ORDERS_API}?${text}`),
  });
}

export function purchaseOrderQuery(id: string) {
  return queryOptions({
    queryKey: [...PURCHASE_ORDERS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<PurchaseOrderDetail>(
        `${PURCHASE_ORDERS_API}/${encodeURIComponent(id)}`,
      ),
  });
}

/** Suppliers, billing addresses, T&C and orderable PRs of a Project. */
export function purchaseOrderFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...PURCHASE_ORDERS_KEY, "form-options", projectId] as const,
    queryFn: () =>
      apiJson<PurchaseOrderFormOptions>(
        `${PURCHASE_ORDERS_API}/form-options?projectId=${encodeURIComponent(projectId)}`,
      ),
    staleTime: 0,
  });
}

export function purchaseOrderPdfUrl(id: string, print = false): string {
  return `${PURCHASE_ORDERS_API}/${encodeURIComponent(id)}/pdf${print ? "?inline=1" : ""}`;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function itemUrl(id: string, action: string): string {
  return `${PURCHASE_ORDERS_API}/${encodeURIComponent(id)}/${action}`;
}

/** PO writes move the PR's fulfilment too: refresh all of procurement. */
function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: PROCUREMENT_KEY });
}

export function useCreatePurchaseOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreatePurchaseOrderInput) =>
      postJson<PurchaseOrderDetail>(PURCHASE_ORDERS_API, input),
    onSuccess: invalidate,
  });
}

export function useUpdatePurchaseOrder(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdatePurchaseOrderInput) =>
      postJson<PurchaseOrderDetail>(itemUrl(id, "update"), input),
    onSuccess: invalidate,
  });
}

export type PurchaseOrderCommand =
  | { kind: "approve"; id: string; expectedUpdatedAt?: string }
  | { kind: "reject"; id: string; reason: string; expectedUpdatedAt?: string }
  | { kind: "mark-ordered"; id: string; expectedUpdatedAt?: string }
  | { kind: "close"; id: string; reason: string; expectedUpdatedAt?: string }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

export function usePurchaseOrderCommand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (command: PurchaseOrderCommand): Promise<void> => {
      const { kind, id, ...body } = command;
      await postJson<unknown>(itemUrl(id, kind), body);
    },
    onSuccess: invalidate,
  });
}

export function useBulkDecidePurchaseOrders() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      ids: string[];
      approve: boolean;
      reason?: string;
    }) =>
      postJson<{ decided: number }>(
        `${PURCHASE_ORDERS_API}/${input.approve ? "bulk-approve" : "bulk-reject"}`,
        input.approve
          ? { projectId: input.projectId, ids: input.ids }
          : { projectId: input.projectId, ids: input.ids, reason: input.reason },
      ),
    onSuccess: invalidate,
  });
}
