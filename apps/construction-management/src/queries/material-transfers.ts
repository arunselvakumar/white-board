import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionProcurementMaterialTransferResponseModel,
  CreateConstructionProcurementMaterialTransferRequestModel,
  GetConstructionProcurementTransferStockResponseModel,
  ListConstructionProcurementMaterialTransfersResponseModel,
  ListConstructionProcurementTransferStoresResponseModel,
  UpdateConstructionProcurementMaterialTransferRequestModel,
} from "@/app/api/construction/procurement/transfers/transfer-models";
import type { TransferStatus } from "@/src/procurement/domain/material-transfer";
import type { StockLocation } from "@/src/procurement/domain/stock-location";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";

export type MaterialTransfer =
  ConstructionProcurementMaterialTransferResponseModel;
export type MaterialTransferPage =
  ListConstructionProcurementMaterialTransfersResponseModel;
export type CreateTransferInput = z.input<
  typeof CreateConstructionProcurementMaterialTransferRequestModel
>;
export type UpdateTransferInput = z.input<
  typeof UpdateConstructionProcurementMaterialTransferRequestModel
>;
export type StoreOption =
  ListConstructionProcurementTransferStoresResponseModel["items"][number];

export const TRANSFERS_API = `${PROCUREMENT_API}/transfers`;
export const TRANSFERS_KEY = [...PROCUREMENT_KEY, "transfers"] as const;

export type TransferFilters = {
  direction?: "in" | "out" | null;
  status?: TransferStatus | null;
  from?: string;
  to?: string;
  cursor?: { after?: string; before?: string } | null;
};

/** Transfers into and out of a Project or Store, newest first. */
export function transfersQuery(
  location: StockLocation,
  filters: TransferFilters = {},
) {
  const params = new URLSearchParams({
    locationKind: location.kind,
    locationId: location.id,
    limit: "25",
  });
  if (filters.direction != null) params.set("direction", filters.direction);
  if (filters.status != null) params.set("status", filters.status);
  if (filters.from != null && filters.from !== "")
    params.set("from", filters.from);
  if (filters.to != null && filters.to !== "") params.set("to", filters.to);
  if (filters.cursor?.after != null) params.set("after", filters.cursor.after);
  if (filters.cursor?.before != null)
    params.set("before", filters.cursor.before);
  return queryOptions({
    queryKey: [...TRANSFERS_KEY, "list", params.toString()],
    queryFn: () => apiJson<MaterialTransferPage>(`${TRANSFERS_API}?${params}`),
  });
}

export function transferQuery(id: string) {
  return queryOptions({
    queryKey: [...TRANSFERS_KEY, "detail", id],
    queryFn: () =>
      apiJson<MaterialTransfer>(`${TRANSFERS_API}/${encodeURIComponent(id)}`),
  });
}

/** Stores for the form's From and To. */
export const transferStoresQuery = queryOptions({
  queryKey: [...TRANSFERS_KEY, "stores"],
  queryFn: async () =>
    (
      await apiJson<ListConstructionProcurementTransferStoresResponseModel>(
        `${TRANSFERS_API}/stores`,
      )
    ).items,
  staleTime: 60_000,
});

/** Stock at the source on the transfer date, per material. */
export function transferStockQuery(
  from: StockLocation | null,
  materialIds: readonly string[],
  on: string | null,
) {
  const params = new URLSearchParams();
  if (from != null) {
    params.set("fromKind", from.kind);
    params.set("fromId", from.id);
  }
  params.set("materialIds", [...materialIds].sort().join(","));
  if (on != null && on !== "") params.set("on", on);
  return queryOptions({
    queryKey: [...TRANSFERS_KEY, "stock", params.toString()],
    queryFn: async () =>
      (
        await apiJson<GetConstructionProcurementTransferStockResponseModel>(
          `${TRANSFERS_API}/available-stock?${params}`,
        )
      ).stock,
    enabled: from != null && materialIds.length > 0,
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${TRANSFERS_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A transfer write changes stock and in-transit figures too. */
function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: PROCUREMENT_KEY });
}

export function useCreateTransfer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateTransferInput) =>
      post<MaterialTransfer>("", input),
    onSuccess: invalidate,
  });
}

export function useUpdateTransfer(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateTransferInput) =>
      post<MaterialTransfer>(`/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export type TransferAction =
  | { action: "approve"; expectedUpdatedAt: string }
  | { action: "reject"; reason: string }
  | { action: "deliver"; deliveredOn: string };

/** Approve, Reject or Mark as Delivered. */
export function useTransferAction(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ action, ...body }: TransferAction) =>
      post<MaterialTransfer>(`/${encodeURIComponent(id)}/${action}`, body),
    onSuccess: invalidate,
  });
}

export function useDeleteTransfer(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      post<undefined>(`/${encodeURIComponent(id)}/delete`, {
        expectedUpdatedAt,
      }),
    onSuccess: invalidate,
  });
}

/** Pages of a Project's transfers. */
export function projectTransfersPath(projectId: string, id?: string): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}/materials/transfers`;
  return id == null ? base : `${base}/${encodeURIComponent(id)}`;
}
