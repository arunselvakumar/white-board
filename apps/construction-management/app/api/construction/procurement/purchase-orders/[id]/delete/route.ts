import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  purchaseOrderHandlers as handlers,
  requirePurchaseOrderAccess,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseOrderParamsModel,
  DeleteConstructionProcurementPurchaseOrderRequestModel,
} from "../../purchase-order-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a Purchase Order (a tombstone). Refused with 409
 * `PURCHASE_ORDER_HAS_RECEIPTS` once a Goods Receipt points at it; its
 * PR stops counting the quantities.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementPurchaseOrderParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requirePurchaseOrderAccess(request, id, ["delete"]);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionProcurementPurchaseOrderRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
