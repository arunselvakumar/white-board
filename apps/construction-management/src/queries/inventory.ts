import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  AdjustConstructionProcurementStockRequestModel,
  ConstructionProcurementInventoryRowResponseModel,
  ConstructionProcurementStockEntryResponseModel,
  ConstructionProcurementStockMovementResponseModel,
  EditConstructionProcurementStockMovementRequestModel,
  GetConstructionProcurementInventoryHistoryResponseModel,
  GetConstructionProcurementStockRegisterResponseModel,
  ImportConstructionProcurementInventoryResponseModel,
  ListConstructionProcurementInventoryResponseModel,
  RecordConstructionProcurementStockMovementsRequestModel,
  RecordConstructionProcurementStockMovementsResponseModel,
  UpdateConstructionProcurementStockSettingsRequestModel,
} from "@/app/api/construction/procurement/inventory/inventory-models";
import type { StockState } from "@/src/procurement/domain/inventory-stock-state";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import type { z } from "zod";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";

export type InventoryList = ListConstructionProcurementInventoryResponseModel;
export type InventoryRow = ConstructionProcurementInventoryRowResponseModel;
export type StockEntry = ConstructionProcurementStockEntryResponseModel;
export type InventoryHistory =
  GetConstructionProcurementInventoryHistoryResponseModel;
export type StockRegister =
  GetConstructionProcurementStockRegisterResponseModel;
export type StockRegisterRow = StockRegister["items"][number];
export type StockMovement = ConstructionProcurementStockMovementResponseModel;
export type InventoryImportResult =
  ImportConstructionProcurementInventoryResponseModel;
export type RecordMovementsInput = z.input<
  typeof RecordConstructionProcurementStockMovementsRequestModel
>;
export type AdjustStockInput = z.input<
  typeof AdjustConstructionProcurementStockRequestModel
>;
export type EditMovementInput = z.input<
  typeof EditConstructionProcurementStockMovementRequestModel
>;
export type StockSettingsInput = z.input<
  typeof UpdateConstructionProcurementStockSettingsRequestModel
>;

export const INVENTORY_API = `${PROCUREMENT_API}/inventory`;

/** Every stock read (lists, history, register, in transit) starts here. */
export const INVENTORY_KEY = [...PROCUREMENT_KEY, "inventory"] as const;

export function inventoryLocationKey(location: StockLocation) {
  return [...INVENTORY_KEY, location.kind, location.id] as const;
}

function locationParams(location: StockLocation): URLSearchParams {
  return new URLSearchParams({
    locationKind: location.kind,
    locationId: location.id,
  });
}

export type InventoryFilters = {
  categoryId?: string | null;
  state?: StockState | null;
  search?: string;
};

function filterParams(
  location: StockLocation,
  filters: InventoryFilters,
): URLSearchParams {
  const params = locationParams(location);
  if (filters.categoryId != null) params.set("categoryId", filters.categoryId);
  if (filters.state != null) params.set("state", filters.state);
  const search = filters.search?.trim() ?? "";
  if (search !== "") params.set("search", search);
  return params;
}

/**
 * Current Inventory of a Project or Store. Filters are applied on the
 * server; the summary counts every material.
 */
export function inventoryQuery(
  location: StockLocation,
  filters: InventoryFilters = {},
) {
  const params = filterParams(location, filters);
  return queryOptions({
    queryKey: [...inventoryLocationKey(location), "list", params.toString()],
    queryFn: () => apiJson<InventoryList>(`${INVENTORY_API}?${params}`),
  });
}

/** Export Data: the list as .xlsx with the same filters. */
export function inventoryExportUrl(
  location: StockLocation,
  filters: InventoryFilters = {},
): string {
  return `${INVENTORY_API}/export?${filterParams(location, filters)}`;
}

/** Export Sample Excel: the Import Inventory Stock sheet. */
export function inventorySampleUrl(location: StockLocation): string {
  return `${INVENTORY_API}/sample?${locationParams(location)}`;
}

/** A material's history at a location, newest first; `cursor` pages. */
export function inventoryHistoryQuery(
  location: StockLocation,
  materialId: string,
  cursor: { after?: string; before?: string } = {},
) {
  const params = locationParams(location);
  params.set("materialId", materialId);
  params.set("limit", "50");
  if (cursor.after != null) params.set("after", cursor.after);
  if (cursor.before != null) params.set("before", cursor.before);
  return queryOptions({
    queryKey: [
      ...inventoryLocationKey(location),
      "history",
      materialId,
      params.toString(),
    ],
    queryFn: () =>
      apiJson<InventoryHistory>(`${INVENTORY_API}/history?${params}`),
  });
}

export type RegisterRange = { from: string; to: string };

function registerParams(location: StockLocation, range: RegisterRange) {
  const params = locationParams(location);
  params.set("from", range.from);
  params.set("to", range.to);
  return params;
}

export function stockRegisterQuery(
  location: StockLocation,
  range: RegisterRange,
) {
  const params = registerParams(location, range);
  return queryOptions({
    queryKey: [
      ...inventoryLocationKey(location),
      "register",
      params.toString(),
    ],
    queryFn: () =>
      apiJson<StockRegister>(`${INVENTORY_API}/register?${params}`),
  });
}

export function stockRegisterExportUrl(
  location: StockLocation,
  range: RegisterRange,
): string {
  return `${INVENTORY_API}/register/export?${registerParams(location, range)}`;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${INVENTORY_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Stock changes ripple: lists, history, register, transfers' available stock. */
function useInvalidateStock() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: PROCUREMENT_KEY });
}

/** Consume Material or Missing Material, one or many lines. */
export function useRecordMovements() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: RecordMovementsInput) =>
      post<RecordConstructionProcurementStockMovementsResponseModel>(
        "/movements",
        input,
      ),
    onSuccess: invalidate,
  });
}

export function useAdjustStock() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: AdjustStockInput) =>
      post<StockMovement>("/adjustments", input),
    onSuccess: invalidate,
  });
}

export function useEditMovement() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: ({ id, ...input }: EditMovementInput & { id: string }) =>
      post<StockMovement>(`/movements/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteMovement() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: ({
      id,
      expectedUpdatedAt,
    }: {
      id: string;
      expectedUpdatedAt: string;
    }) =>
      post<undefined>(`/movements/${encodeURIComponent(id)}/delete`, {
        expectedUpdatedAt,
      }),
    onSuccess: invalidate,
  });
}

/** Estimated Qty, the minimum override and the alert toggle. */
export function useUpdateStockSettings() {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: (input: StockSettingsInput) =>
      post<InventoryRow>("/settings", input),
    onSuccess: invalidate,
  });
}

/** Import Inventory Stock: preview (`dryRun`) or post all rows or none. */
export function useImportInventory(location: StockLocation) {
  const invalidate = useInvalidateStock();
  return useMutation({
    mutationFn: ({
      file,
      dryRun,
      openingDate,
    }: {
      file: File;
      dryRun: boolean;
      /** The Opening entries' date; the Company's today when left out. */
      openingDate?: string;
    }) => {
      const params = locationParams(location);
      params.set("dryRun", dryRun ? "true" : "false");
      if (openingDate != null && openingDate !== "")
        params.set("openingDate", openingDate);
      return apiJson<InventoryImportResult>(
        `${INVENTORY_API}/import?${params}`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: file,
        },
      );
    },
    onSuccess: (_, { dryRun }) => (dryRun ? undefined : invalidate()),
  });
}

/** A `STOCK_INSUFFICIENT` refusal's lines, for the screen. */
export type StockShortfall = {
  materialId: string;
  materialName: string | null;
  shortBy: string;
  onDate: string;
};

export function stockShortfalls(details: unknown): StockShortfall[] {
  if (
    typeof details !== "object" ||
    details == null ||
    !("shortfalls" in details) ||
    !Array.isArray(details.shortfalls)
  )
    return [];
  return details.shortfalls as StockShortfall[];
}
