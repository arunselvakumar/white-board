import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionContractsItemFormOptionsResponseModel,
  ConstructionContractsItemLineModel,
  ConstructionContractsItemMaterialOptionModel,
  ConstructionContractsItemResponseModel,
  ConstructionContractsItemSummaryModel,
  CreateConstructionContractsItemRequestModel,
  ImportConstructionContractsItemsResponseModel,
  ListConstructionContractsItemMaterialOptionsResponseModel,
  ListConstructionContractsItemSchedulesResponseModel,
  ListConstructionContractsItemsResponseModel,
} from "@/app/api/construction/contracts/items/item-models";

import { apiJson } from "./http";
import { CONTRACTS_API, CONTRACTS_KEY } from "./contracts-access";

export type Item = ConstructionContractsItemResponseModel;
export type ItemSummary = ConstructionContractsItemSummaryModel;
export type ItemLine = ConstructionContractsItemLineModel;
export type ItemPage = ListConstructionContractsItemsResponseModel;
export type ItemInput = CreateConstructionContractsItemRequestModel;
export type ItemFormOptions = ConstructionContractsItemFormOptionsResponseModel;
export type ItemMaterialOption = ConstructionContractsItemMaterialOptionModel;
export type ItemImportResult = ImportConstructionContractsItemsResponseModel;

/** A problem in an uploaded sheet (400 IMPORT_HAS_ERRORS `details.errors`). */
export type ItemImportRowError = {
  row: number;
  column: string;
  message: string;
};

export const ITEMS_API = `${CONTRACTS_API}/items`;

/** Every Item Library query key starts here (CM-1102). */
export const ITEMS_KEY = [...CONTRACTS_KEY, "items"] as const;

export type ItemListFilter = {
  search: string;
  /** "" for every schedule. */
  schedule: string;
  cursor: { after: string } | { before: string } | null;
};

function filterQuery(filter: Pick<ItemListFilter, "search" | "schedule">) {
  const query = new URLSearchParams();
  const search = filter.search.trim();
  if (search !== "") query.set("q", search);
  if (filter.schedule !== "") query.set("schedule", filter.schedule);
  return query;
}

export function itemsQuery(filter: ItemListFilter) {
  const query = filterQuery(filter);
  if (filter.cursor != null) {
    if ("after" in filter.cursor) query.set("after", filter.cursor.after);
    else query.set("before", filter.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...ITEMS_KEY, "list", text] as const,
    queryFn: () =>
      apiJson<ItemPage>(text === "" ? ITEMS_API : `${ITEMS_API}?${text}`),
  });
}

export function itemQuery(id: string) {
  return queryOptions({
    queryKey: [...ITEMS_KEY, "one", id] as const,
    queryFn: () => apiJson<Item>(`${ITEMS_API}/${encodeURIComponent(id)}`),
  });
}

/** The schedule filter's choices. */
export function itemSchedulesQuery() {
  return queryOptions({
    queryKey: [...ITEMS_KEY, "schedules"] as const,
    queryFn: async () =>
      (
        await apiJson<ListConstructionContractsItemSchedulesResponseModel>(
          `${ITEMS_API}/schedules`,
        )
      ).items,
  });
}

/** UoMs, Labour Categories and Equipment for the Item form. */
export function itemFormOptionsQuery() {
  return queryOptions({
    queryKey: [...ITEMS_KEY, "form-options"] as const,
    queryFn: () => apiJson<ItemFormOptions>(`${ITEMS_API}/form-options`),
    staleTime: 60_000,
  });
}

/** Materials for a rate analysis line, by name. */
export function itemMaterialOptionsQuery(search: string) {
  const query = new URLSearchParams();
  if (search !== "") query.set("search", search);
  const text = query.toString();
  return queryOptions({
    queryKey: [...ITEMS_KEY, "material-options", text] as const,
    queryFn: async () =>
      (
        await apiJson<ListConstructionContractsItemMaterialOptionsResponseModel>(
          `${ITEMS_API}/material-options${text === "" ? "" : `?${text}`}`,
        )
      ).items,
  });
}

/** The import sample's download link. */
export const ITEM_SAMPLE_URL = `${ITEMS_API}/sample`;

/** The export of the list's current search and schedule. */
export function itemExportUrl(
  filter: Pick<ItemListFilter, "search" | "schedule">,
): string {
  const text = filterQuery(filter).toString();
  return `${ITEMS_API}/export${text === "" ? "" : `?${text}`}`;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidateItems() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ITEMS_KEY });
}

export function useCreateItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (input: ItemInput) => post<Item>(ITEMS_API, input),
    onSuccess: invalidate,
  });
}

export function useUpdateItem(id: string) {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (input: ItemInput & { expectedUpdatedAt: string }) =>
      post<Item>(`${ITEMS_API}/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (item: Pick<ItemSummary, "id" | "updatedAt">) =>
      post<null>(`${ITEMS_API}/${encodeURIComponent(item.id)}/delete`, {
        expectedUpdatedAt: item.updatedAt,
      }),
    onSuccess: invalidate,
  });
}

/** Uploads the filled sample; every row or none. */
export function useImportItems() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (file: File) =>
      apiJson<ItemImportResult>(`${ITEMS_API}/import`, {
        method: "POST",
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: file,
      }),
    onSuccess: invalidate,
  });
}
