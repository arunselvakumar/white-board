import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  purchaseRequestHandlers as handlers,
  requirePurchaseRequestAccess,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseRequestParamsModel,
  DeleteConstructionProcurementPurchaseRequestRequestModel,
} from "../../purchase-request-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a Purchase Request (a tombstone; its number is never reused).
 * Refused with 409 `PURCHASE_REQUEST_HAS_ORDERS` once a Purchase Order
 * line points at it (CM-0015 §7). Needs delete on its Project.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementPurchaseRequestParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requirePurchaseRequestAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionProcurementPurchaseRequestRequestModel.safeParse(
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
