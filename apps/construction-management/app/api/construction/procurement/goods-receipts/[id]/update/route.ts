import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionProcurementGoodsReceiptParamsModel,
  toGoodsReceiptResponse,
  UpdateConstructionProcurementGoodsReceiptRequestModel,
} from "../../goods-receipt-models";
import {
  actorOf,
  goodsReceiptHandlers as handlers,
  receiptFinancial,
  requireReceiptAccess,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Edits a GRN (Material Received update): its ledger entries are reversed
 * and posted again, refused (409 `STOCK_INSUFFICIENT`) when stock it
 * brought in has already gone out; the PO's receipt follows. Back-dated
 * edit limits apply to the stored and the new dates.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementGoodsReceiptParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireReceiptAccess(request, "update", id);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionProcurementGoodsReceiptRequestModel.safeParse(
        await request.json(),
      ),
    );
    const financial = receiptFinancial(
      session.access,
      session.receipt.location,
    );
    const receipt = await handlers.edit({
      actor: actorOf(session),
      financial,
      id,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
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
    );
  } catch (error) {
    return mapError(error);
  }
}
