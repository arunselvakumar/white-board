import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProcurementGoodsReceiptResponseModel,
  GetConstructionProcurementGoodsReceiptFormOptionsResponseModel,
  ListConstructionProcurementGoodsReceiptsResponseModel,
  PostConstructionProcurementGoodsReceiptRequestModel,
  UpdateConstructionProcurementGoodsReceiptRequestModel,
} from "@/app/api/construction/procurement/goods-receipts/goods-receipt-models";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";

export type GoodsReceipt = ConstructionProcurementGoodsReceiptResponseModel;
export type GoodsReceiptLine = GoodsReceipt["lines"][number];
export type GoodsReceiptPage =
  ListConstructionProcurementGoodsReceiptsResponseModel;
export type GoodsReceiptListItem = GoodsReceiptPage["items"][number];
export type GoodsReceiptFormOptions =
  GetConstructionProcurementGoodsReceiptFormOptionsResponseModel;
export type ReceivableOrder = GoodsReceiptFormOptions["purchaseOrders"][number];
export type PostGoodsReceiptInput =
  PostConstructionProcurementGoodsReceiptRequestModel;
export type UpdateGoodsReceiptInput =
  UpdateConstructionProcurementGoodsReceiptRequestModel;

export const GOODS_RECEIPTS_API = `${PROCUREMENT_API}/goods-receipts`;

/** Every GRN query key starts here (under `PROCUREMENT_KEY`). */
export const GOODS_RECEIPTS_KEY = [...PROCUREMENT_KEY, "goods-receipts"] as const;

export type GoodsReceiptLocation = {
  kind: "project" | "store";
  id: string;
};

export type GoodsReceiptListFilter = {
  location: GoodsReceiptLocation;
  from: string;
  to: string;
  supplierId: string | null;
  purchaseOrder: "with" | "without" | null;
  search: string;
  cursor: { after: string } | { before: string } | null;
};

export function goodsReceiptsQuery(filter: GoodsReceiptListFilter) {
  const query = new URLSearchParams({
    locationKind: filter.location.kind,
    locationId: filter.location.id,
  });
  if (filter.from !== "") query.set("from", filter.from);
  if (filter.to !== "") query.set("to", filter.to);
  if (filter.supplierId != null) query.set("supplierId", filter.supplierId);
  if (filter.purchaseOrder != null)
    query.set("purchaseOrder", filter.purchaseOrder);
  if (filter.search.trim() !== "") query.set("search", filter.search.trim());
  if (filter.cursor != null) {
    if ("after" in filter.cursor) query.set("after", filter.cursor.after);
    else query.set("before", filter.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...GOODS_RECEIPTS_KEY, "list", text],
    queryFn: () => apiJson<GoodsReceiptPage>(`${GOODS_RECEIPTS_API}?${text}`),
  });
}

export function goodsReceiptQuery(id: string) {
  return queryOptions({
    queryKey: [...GOODS_RECEIPTS_KEY, "detail", id],
    queryFn: () =>
      apiJson<GoodsReceipt>(
        `${GOODS_RECEIPTS_API}/${encodeURIComponent(id)}`,
      ),
  });
}

export function goodsReceiptFormOptionsQuery(
  location: GoodsReceiptLocation,
  goodsReceiptId: string | null = null,
) {
  const query = new URLSearchParams({
    locationKind: location.kind,
    locationId: location.id,
  });
  if (goodsReceiptId != null) query.set("goodsReceiptId", goodsReceiptId);
  const text = query.toString();
  return queryOptions({
    queryKey: [...GOODS_RECEIPTS_KEY, "form-options", text],
    queryFn: () =>
      apiJson<GoodsReceiptFormOptions>(
        `${GOODS_RECEIPTS_API}/form-options?${text}`,
      ),
  });
}

/** Streams the GRN PDF (print). */
export function goodsReceiptPdfUrl(id: string): string {
  return `${GOODS_RECEIPTS_API}/${encodeURIComponent(id)}/pdf`;
}

/**
 * A GRN moves stock and its PO's receipt, so every write refreshes all of
 * procurement, not only the GRN keys.
 */
function useInvalidateProcurement() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: PROCUREMENT_KEY });
}

export function usePostGoodsReceipt() {
  const invalidate = useInvalidateProcurement();
  return useMutation({
    mutationFn: (input: PostGoodsReceiptInput) =>
      apiJson<GoodsReceipt>(GOODS_RECEIPTS_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateGoodsReceipt(id: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateProcurement();
  return useMutation({
    mutationFn: (input: UpdateGoodsReceiptInput) =>
      apiJson<GoodsReceipt>(
        `${GOODS_RECEIPTS_API}/${encodeURIComponent(id)}/update`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        },
      ),
    onSuccess: async (updated) => {
      client.setQueryData(goodsReceiptQuery(id).queryKey, updated);
      await invalidate();
    },
  });
}

/** The deleted GRN's own detail is not refetched (it is gone: 404). */
export function useDeleteGoodsReceipt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; expectedUpdatedAt: string }) =>
      apiJson<undefined>(
        `${GOODS_RECEIPTS_API}/${encodeURIComponent(input.id)}/delete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedUpdatedAt: input.expectedUpdatedAt }),
        },
      ),
    onSuccess: (_result, input) => {
      const detail = goodsReceiptQuery(input.id).queryKey;
      void client.invalidateQueries({
        queryKey: PROCUREMENT_KEY,
        predicate: (query) =>
          JSON.stringify(query.queryKey) !== JSON.stringify(detail),
      });
    },
  });
}
