import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionProcurementGoodsReceiptParamsModel,
  DeleteConstructionProcurementGoodsReceiptRequestModel,
} from "../../goods-receipt-models";
import {
  actorOf,
  goodsReceiptHandlers as handlers,
  requireReceiptAccess,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Deletes a GRN (Material Received delete): tombstone, ledger reversal and
 * the PO's receipt recomputed; refused when its stock has gone out.
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
    const session = await requireReceiptAccess(request, "delete", id);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionProcurementGoodsReceiptRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete({
      actor: actorOf(session),
      id,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
