import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionProcurementGoodsReceiptParamsModel,
  toGoodsReceiptResponse,
} from "../goods-receipt-models";
import {
  goodsReceiptHandlers as handlers,
  receiptFinancial,
  requireReceiptAccess,
} from "../handlers";

export const dynamic = "force-dynamic";

/** One live GRN with its PO's ordered and received quantities (read). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementGoodsReceiptParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireReceiptAccess(request, "read", id);
    if (isResponse(session)) return session;
    const { receipt } = session;
    return Response.json(
      toGoodsReceiptResponse(
        await handlers.view(receipt),
        receiptFinancial(session.access, receipt.location),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
