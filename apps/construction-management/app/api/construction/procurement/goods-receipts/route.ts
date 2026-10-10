import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { stockLocation } from "@/src/procurement/domain/stock-location";
import { can } from "@/src/shared-kernel/access";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  ListConstructionProcurementGoodsReceiptsRequestModel,
  PostConstructionProcurementGoodsReceiptRequestModel,
  toGoodsReceiptListItem,
  toGoodsReceiptResponse,
  type ListConstructionProcurementGoodsReceiptsResponseModel,
} from "./goods-receipt-models";
import {
  actorOf,
  GOODS_RECEIPT_MENU,
  goodsReceiptHandlers as handlers,
  locationScope,
  receiptFinancial,
} from "./handlers";

export const dynamic = "force-dynamic";

/**
 * Goods Receipts of a Project or Store, newest first, by GR Date, supplier,
 * PO (or without one) and number / invoice / challan search (CM-505).
 * Material Received read on the location; without View All only the
 * caller's own; values need Financial.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionProcurementGoodsReceiptsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const location = stockLocation(model.locationKind, model.locationId);
    const session = await requireAccess(
      request,
      GOODS_RECEIPT_MENU,
      "read",
      locationScope(location),
    );
    if (isResponse(session)) return session;
    const viewAll = can(
      session.access,
      GOODS_RECEIPT_MENU,
      "view_all",
      locationScope(location),
    );
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      location,
      createdBy: viewAll ? undefined : session.userId,
      from: model.from,
      to: model.to,
      supplierId: model.supplierId,
      purchaseOrderId: model.purchaseOrderId,
      withPurchaseOrder:
        model.purchaseOrder == null
          ? undefined
          : model.purchaseOrder === "with",
      search: model.search,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const financial = receiptFinancial(session.access, location);
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionProcurementGoodsReceiptsResponseModel = {
      items: page.items.map((item) => toGoodsReceiptListItem(item, financial)),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
      financial,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Posts a GRN to a Project or Store (Material Received create): numbered,
 * Received ledger entries on the Inventory Date, the linked PO's receipt
 * recomputed, audited, `GoodsReceiptPosted` after commit.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      PostConstructionProcurementGoodsReceiptRequestModel.safeParse(
        await request.json(),
      ),
    );
    const location = stockLocation(model.locationKind, model.locationId);
    const session = await requireAccess(
      request,
      GOODS_RECEIPT_MENU,
      "create",
      locationScope(location),
    );
    if (isResponse(session)) return session;
    const financial = receiptFinancial(session.access, location);
    const receipt = await handlers.post({
      actor: actorOf(session),
      financial,
      location,
      receiptDate: model.receiptDate,
      inventoryDate: model.inventoryDate,
      supplierId: model.supplierId,
      purchaseOrderId: model.purchaseOrderId,
      supplyType: model.supplyType,
      details: model,
      lines: model.lines,
    });
    return Response.json(
      toGoodsReceiptResponse(await handlers.view(receipt), financial),
      { status: StatusCodes.CREATED },
    );
  } catch (error) {
    return mapError(error);
  }
}
