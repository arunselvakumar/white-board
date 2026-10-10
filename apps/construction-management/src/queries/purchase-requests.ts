import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  CreateConstructionProcurementPurchaseRequestRequestModel,
  GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel,
  GetConstructionProcurementPurchaseRequestResponseModel,
  ListConstructionProcurementPurchaseRequestsResponseModel,
  UpdateConstructionProcurementPurchaseRequestRequestModel,
} from "@/app/api/construction/procurement/purchase-requests/purchase-request-models";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";

export type PurchaseRequest =
  ListConstructionProcurementPurchaseRequestsResponseModel["items"][number];
export type PurchaseRequestDetail =
  GetConstructionProcurementPurchaseRequestResponseModel;
export type PurchaseRequestPage =
  ListConstructionProcurementPurchaseRequestsResponseModel;
export type PurchaseRequestQuantityInfo =
  GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel["items"][number];
export type CreatePurchaseRequestInput = z.input<
  typeof CreateConstructionProcurementPurchaseRequestRequestModel
>;
export type UpdatePurchaseRequestInput = z.input<
  typeof UpdateConstructionProcurementPurchaseRequestRequestModel
>;

export const PURCHASE_REQUESTS_API = `${PROCUREMENT_API}/purchase-requests`;

/** Every Purchase Request key starts here (under `PROCUREMENT_KEY`). */
export const PURCHASE_REQUESTS_KEY = [
  ...PROCUREMENT_KEY,
  "purchase-requests",
] as const;

export type PurchaseRequestFilter = {
  projectId: string;
  from?: string;
  to?: string;
  approvalStatus?: "pending" | "approved" | "rejected";
  orderStatus?:
    "not_ordered" | "partially_ordered" | "ordered" | "excess_ordered";
  categoryId?: string;
  materialId?: string;
  createdBy?: string;
  locationType?: string;
  cursor?: { after: string } | { before: string } | null;
};

export function purchaseRequestsQuery(filter: PurchaseRequestFilter) {
  const query = new URLSearchParams({ projectId: filter.projectId });
  for (const key of [
    "from",
    "to",
    "approvalStatus",
    "orderStatus",
    "categoryId",
    "materialId",
    "createdBy",
    "locationType",
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
    queryKey: [...PURCHASE_REQUESTS_KEY, "list", text] as const,
    queryFn: () =>
      apiJson<PurchaseRequestPage>(`${PURCHASE_REQUESTS_API}?${text}`),
  });
}

export function purchaseRequestQuery(id: string) {
  return queryOptions({
    queryKey: [...PURCHASE_REQUESTS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<PurchaseRequestDetail>(
        `${PURCHASE_REQUESTS_API}/${encodeURIComponent(id)}`,
      ),
  });
}

/** Available Stock and Balanced estimated qty at the Project (wizard step 2). */
export function purchaseRequestQuantityInfoQuery(
  projectId: string,
  materialIds: readonly string[],
  excludePurchaseRequestId?: string | null,
) {
  const query = new URLSearchParams({
    projectId,
    materialIds: [...materialIds].sort().join(","),
  });
  if (excludePurchaseRequestId != null)
    query.set("excludePurchaseRequestId", excludePurchaseRequestId);
  const text = query.toString();
  return queryOptions({
    queryKey: [...PURCHASE_REQUESTS_KEY, "quantity-info", text] as const,
    queryFn: async () =>
      materialIds.length === 0
        ? []
        : (
            await apiJson<GetConstructionProcurementPurchaseRequestQuantityInfoResponseModel>(
              `${PURCHASE_REQUESTS_API}/quantity-info?${text}`,
            )
          ).items,
  });
}

/** The PR PDF; `print` opens it inline for the browser's print dialog. */
export function purchaseRequestPdfUrl(id: string, print = false): string {
  return `${PURCHASE_REQUESTS_API}/${encodeURIComponent(id)}/pdf${print ? "?inline=1" : ""}`;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function itemUrl(id: string, action: string): string {
  return `${PURCHASE_REQUESTS_API}/${encodeURIComponent(id)}/${action}`;
}

/** Purchase Request writes change Purchase Orders' options and the dashboard too. */
function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: PROCUREMENT_KEY });
}

export function useCreatePurchaseRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreatePurchaseRequestInput) =>
      postJson<PurchaseRequestDetail>(PURCHASE_REQUESTS_API, input),
    onSuccess: invalidate,
  });
}

export function useUpdatePurchaseRequest(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdatePurchaseRequestInput) =>
      postJson<PurchaseRequestDetail>(itemUrl(id, "update"), input),
    onSuccess: invalidate,
  });
}

export type PurchaseRequestCommand =
  | { kind: "approve"; id: string; expectedUpdatedAt?: string }
  | { kind: "reject"; id: string; reason: string; expectedUpdatedAt?: string }
  | { kind: "mark-ordered"; id: string; expectedUpdatedAt?: string }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

/** Approve, reject, Mark as Ordered or delete one Purchase Request. */
export function usePurchaseRequestCommand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (command: PurchaseRequestCommand): Promise<void> => {
      const { kind, id, ...body } = command;
      await postJson<unknown>(itemUrl(id, kind), body);
    },
    onSuccess: invalidate,
  });
}

/** Bulk approve or reject (all or none) on one Project. */
export function useBulkDecidePurchaseRequests() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      ids: string[];
      approve: boolean;
      reason?: string;
    }) =>
      postJson<{ decided: number }>(
        `${PURCHASE_REQUESTS_API}/${input.approve ? "bulk-approve" : "bulk-reject"}`,
        input.approve
          ? { projectId: input.projectId, ids: input.ids }
          : {
              projectId: input.projectId,
              ids: input.ids,
              reason: input.reason,
            },
      ),
    onSuccess: invalidate,
  });
}
