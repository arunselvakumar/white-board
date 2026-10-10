import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAnyAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { stockLocation } from "@/src/procurement/domain/stock-location";

import {
  GetConstructionProcurementGoodsReceiptFormOptionsRequestModel,
  toFormOptionsResponse,
} from "../goods-receipt-models";
import {
  GOODS_RECEIPT_MENU,
  goodsReceiptHandlers as handlers,
  locationScope,
  receiptFinancial,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * What the GRN form offers at a Project or Store: active Suppliers on it,
 * the POs it can receive against (with ordered and received quantities),
 * the Company's hidden GRN fields. Material Received create or update.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionProcurementGoodsReceiptFormOptionsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const location = stockLocation(model.locationKind, model.locationId);
    const session = await requireAnyAccess(
      request,
      GOODS_RECEIPT_MENU,
      ["create", "update"],
      locationScope(location),
    );
    if (isResponse(session)) return session;
    const options = await handlers.formOptions(session.workspaceId, location, {
      goodsReceiptId: model.goodsReceiptId,
    });
    return Response.json(
      toFormOptionsResponse(
        options,
        receiptFinancial(session.access, location),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
