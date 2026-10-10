import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  purchaseOrderActions,
  purchaseOrderScope,
} from "@/src/procurement/application/purchase-order-handlers";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import {
  PURCHASE_ORDER_MENU,
  purchaseOrderHandlers as handlers,
} from "./handlers";
import {
  CreateConstructionProcurementPurchaseOrderRequestModel,
  ListConstructionProcurementPurchaseOrdersRequestModel,
  placeOf,
  toPurchaseOrderDetailResponse,
  toPurchaseOrderResponse,
  type ListConstructionProcurementPurchaseOrdersResponseModel,
} from "./purchase-order-models";

export const dynamic = "force-dynamic";

/**
 * A Project's (or Store's) Purchase Orders, newest first, by PO Date,
 * approval, receipt status, Supplier and Purchase Request (CM-504). Needs
 * Purchase Order read. Amounts are always shown: the menu has no
 * Financial flag.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionProcurementPurchaseOrdersRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const location = placeOf(model);
    const session = await requireAccess(
      request,
      PURCHASE_ORDER_MENU,
      "read",
      purchaseOrderScope(location),
    );
    if (isResponse(session)) return session;
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      location,
      from: model.from,
      to: model.to,
      approvalStatus: model.approvalStatus,
      receiptStatus: model.receiptStatus,
      supplierId: model.supplierId,
      purchaseRequestId: model.purchaseRequestId,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionProcurementPurchaseOrdersResponseModel = {
      items: page.items.map((item) =>
        toPurchaseOrderResponse(
          item,
          purchaseOrderActions(session.access, item),
        ),
      ),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
      facets: page.facets,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Raises a Purchase Order (CM-504) for a Project or a Store: Save
 * (pending) or Save & Approve (needs Approve). The server prices every
 * line and the totals (CM-0015 §6) and keeps the linked Purchase
 * Request's ordered quantities in step.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionProcurementPurchaseOrderRequestModel.safeParse(
        await request.json(),
      ),
    );
    const location = placeOf(model);
    const session = await requireAccess(
      request,
      PURCHASE_ORDER_MENU,
      "create",
      purchaseOrderScope(location),
    );
    if (isResponse(session)) return session;
    const id = await handlers.create(session.access, location, model);
    const po = await handlers.get(session.workspaceId, id);
    return Response.json(
      toPurchaseOrderDetailResponse(
        po,
        purchaseOrderActions(session.access, po),
      ),
      {
        status: StatusCodes.CREATED,
      },
    );
  } catch (error) {
    return mapError(error);
  }
}
