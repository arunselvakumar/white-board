import { queryOptions } from "@tanstack/react-query";

import type {
  AdjustStockInput,
  IssueStockInput,
  ReceiveStockInput,
  TransferStockInput,
} from "@/src/preschool/application/stock-handlers";
import type {
  ChildStockIssuedView,
  StockItemListView,
  StockItemView,
  StockLedgerView,
  StockMovementResultView,
  StockOnHandView,
} from "@/src/preschool/application/stock-views";
import type { StockMovementKind } from "@/src/preschool/domain/stock";
import type {
  StockCategory,
  StockItemFields,
} from "@/src/preschool/domain/stock-item";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolStockItem = StockItemView;
export type PreschoolStockItemList = StockItemListView;
export type PreschoolStockOnHand = StockOnHandView;
export type PreschoolStockLedger = StockLedgerView;
export type PreschoolStockMovement = StockLedgerView["items"][number];
export type PreschoolStockMovementResult = StockMovementResultView;
export type PreschoolChildStockIssued = ChildStockIssuedView;
export type PreschoolStockCategory = StockCategory;
export type PreschoolStockMovementKind = StockMovementKind;
export type PreschoolStockItemInput = StockItemFields;
export type ReceivePreschoolStockInput = ReceiveStockInput;
export type IssuePreschoolStockInput = IssueStockInput;
export type AdjustPreschoolStockInput = AdjustStockInput;
export type TransferPreschoolStockInput = TransferStockInput;

export type PreschoolStockFilters = {
  centreId: string;
  category?: StockCategory;
  lowOnly?: boolean;
};

export type PreschoolStockLedgerFilters = {
  centreId: string;
  itemId?: string;
  childId?: string;
  kind?: StockMovementKind;
  /** YYYY-MM-DD, inclusive. */
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
};

const BASE = "/api/preschool/stock";

function post<T>(path: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function withQuery(
  path: string,
  query: Record<string, string | number | boolean | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query))
    if (value != null) params.set(name, String(value));
  const search = params.toString();
  return `${BASE}${path}${search === "" ? "" : `?${search}`}`;
}

export const stockKeys = {
  all: [...preschoolKeys.all, "stock"] as const,
  items: (includeArchived: boolean) =>
    [...stockKeys.all, "items", { includeArchived }] as const,
  onHand: (filters: PreschoolStockFilters) =>
    [...stockKeys.all, "on-hand", filters] as const,
  ledger: (filters: PreschoolStockLedgerFilters) =>
    [...stockKeys.all, "ledger", filters] as const,
  child: (childId: string) => [...stockKeys.all, "child", childId] as const,
};

/** Stock Items by category and name. */
export function stockItemsQueryOptions(options?: {
  includeArchived?: boolean;
}) {
  const includeArchived = options?.includeArchived ?? false;
  return queryOptions({
    queryKey: stockKeys.items(includeArchived),
    queryFn: ({ meta }) =>
      apiJson<StockItemListView>(
        withQuery("/items", { includeArchived }),
        {},
        meta,
      ),
  });
}

/** Every Stock Item with its stock on hand at the Centre. */
export function stockOnHandQueryOptions(filters: PreschoolStockFilters) {
  return queryOptions({
    queryKey: stockKeys.onHand(filters),
    queryFn: ({ meta }) =>
      apiJson<StockOnHandView>(withQuery("", filters), {}, meta),
  });
}

/** A Centre's Stock Movements, newest first. */
export function stockLedgerQueryOptions(filters: PreschoolStockLedgerFilters) {
  return queryOptions({
    queryKey: stockKeys.ledger(filters),
    queryFn: ({ meta }) =>
      apiJson<StockLedgerView>(withQuery("/movements", filters), {}, meta),
  });
}

/** What a Child has been issued. */
export function childStockQueryOptions(childId: string) {
  return queryOptions({
    queryKey: stockKeys.child(childId),
    queryFn: ({ meta }) =>
      apiJson<ChildStockIssuedView>(`${BASE}/children/${childId}`, {}, meta),
  });
}

export function createStockItem(
  body: PreschoolStockItemInput,
): Promise<StockItemView> {
  return post<StockItemView>("/items", body);
}

export function updateStockItemDetails(
  id: string,
  body: PreschoolStockItemInput,
): Promise<StockItemView> {
  return post<StockItemView>(`/items/${id}/details`, body);
}

export function archiveStockItem(id: string): Promise<StockItemView> {
  return post<StockItemView>(`/items/${id}/archive`);
}

export function restoreStockItem(id: string): Promise<StockItemView> {
  return post<StockItemView>(`/items/${id}/restore`);
}

export function receiveStock(
  body: ReceivePreschoolStockInput,
): Promise<StockMovementResultView> {
  return post<StockMovementResultView>("/receive", body);
}

export function issueStockToChild(
  body: IssuePreschoolStockInput & { childId: string },
): Promise<StockMovementResultView> {
  return post<StockMovementResultView>("/issue-to-child", body);
}

export function issueStockToClassroom(
  body: IssuePreschoolStockInput & { classroomId: string },
): Promise<StockMovementResultView> {
  return post<StockMovementResultView>("/issue-to-classroom", body);
}

export function issueStockToStaff(
  body: IssuePreschoolStockInput & { staffId: string },
): Promise<StockMovementResultView> {
  return post<StockMovementResultView>("/issue-to-staff", body);
}

export function adjustStock(
  body: AdjustPreschoolStockInput,
): Promise<StockMovementResultView> {
  return post<StockMovementResultView>("/adjust", body);
}

/** Sends stock to another Centre (Owner only). */
export function transferStock(
  body: TransferPreschoolStockInput,
): Promise<StockMovementResultView> {
  return post<StockMovementResultView>("/transfer", body);
}

export const STOCK_CATEGORY_LABELS: Record<StockCategory, string> = {
  books: "Books",
  notebooks: "Notebooks",
  stationery: "Stationery",
  uniform: "Uniform",
  kit: "Kits",
  toys_learning_aids: "Toys & learning aids",
  housekeeping: "Housekeeping",
  furniture_equipment: "Furniture & equipment",
  other: "Other",
};

export const STOCK_MOVEMENT_KIND_LABELS: Record<StockMovementKind, string> = {
  received: "Received",
  issued_to_child: "Issued to Child",
  issued_to_classroom: "Issued to Classroom",
  issued_to_staff: "Issued to Staff",
  transfer_out: "Sent to Centre",
  transfer_in: "Received from Centre",
  adjusted: "Adjusted",
};
