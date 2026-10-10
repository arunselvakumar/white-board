import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProcurementStoreResponseModel,
  CreateConstructionProcurementStoreRequestModel,
  GetConstructionProcurementStoreFormOptionsResponseModel,
  GetConstructionProcurementStoreStockResponseModel,
  ListConstructionProcurementStoreOptionsResponseModel,
  ListConstructionProcurementStoresResponseModel,
} from "@/app/api/construction/procurement/stores/store-models";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";

export type Store = ConstructionProcurementStoreResponseModel;
export type StoreInput = CreateConstructionProcurementStoreRequestModel;
export type StoreStockRow =
  GetConstructionProcurementStoreStockResponseModel["items"][number];
export type StoreFormOptions =
  GetConstructionProcurementStoreFormOptionsResponseModel;

export const STORES_API = `${PROCUREMENT_API}/stores`;
export const STORES_KEY = [...PROCUREMENT_KEY, "stores"] as const;

export function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Stores, newest first (the first 100; a Company has a handful). */
export function storesQuery(search = "") {
  const query = new URLSearchParams({ limit: "100" });
  if (search.trim() !== "") query.set("search", search.trim());
  return queryOptions({
    queryKey: [...STORES_KEY, "list", search.trim()] as const,
    queryFn: () =>
      apiJson<ListConstructionProcurementStoresResponseModel>(
        `${STORES_API}?${query.toString()}`,
      ),
  });
}

export function storeQuery(id: string) {
  return queryOptions({
    queryKey: [...STORES_KEY, "detail", id] as const,
    queryFn: () => apiJson<Store>(`${STORES_API}/${encodeURIComponent(id)}`),
  });
}

export function storeStockQuery(id: string) {
  return queryOptions({
    queryKey: [...STORES_KEY, "stock", id] as const,
    queryFn: async () =>
      (
        await apiJson<GetConstructionProcurementStoreStockResponseModel>(
          `${STORES_API}/${encodeURIComponent(id)}/stock`,
        )
      ).items,
  });
}

export const storeFormOptionsQuery = queryOptions({
  queryKey: [...STORES_KEY, "form-options"] as const,
  queryFn: () => apiJson<StoreFormOptions>(`${STORES_API}/form-options`),
});

/** Live stores for pickers; those serving `projectId` when given. */
export function storeOptionsQuery(projectId: string | null = null) {
  return queryOptions({
    queryKey: [...STORES_KEY, "options", projectId ?? "all"] as const,
    queryFn: async () =>
      (
        await apiJson<ListConstructionProcurementStoreOptionsResponseModel>(
          `${STORES_API}/options${projectId == null ? "" : `?projectId=${encodeURIComponent(projectId)}`}`,
        )
      ).items,
  });
}

function useInvalidateProcurement() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PROCUREMENT_KEY });
}

export function useCreateStore() {
  const invalidate = useInvalidateProcurement();
  return useMutation({
    mutationFn: (input: StoreInput) => postJson<Store>(STORES_API, input),
    onSuccess: invalidate,
  });
}

export function useUpdateStore(id: string) {
  const invalidate = useInvalidateProcurement();
  return useMutation({
    mutationFn: (input: StoreInput & { expectedUpdatedAt: string }) =>
      postJson<Store>(`${STORES_API}/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteStore() {
  const invalidate = useInvalidateProcurement();
  return useMutation({
    mutationFn: (store: { id: string; updatedAt: string }) =>
      postJson<undefined>(
        `${STORES_API}/${encodeURIComponent(store.id)}/delete`,
        { expectedUpdatedAt: store.updatedAt },
      ),
    onSuccess: invalidate,
  });
}
