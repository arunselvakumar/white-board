import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseOrderActions } from "@/src/procurement/application/purchase-order-handlers";

import {
  purchaseOrderHandlers as handlers,
  requirePurchaseOrderAccess,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseOrderParamsModel,
  toPurchaseOrderDetailResponse,
  UpdateConstructionProcurementPurchaseOrderRequestModel,
} from "../../purchase-order-models";

export const dynamic = "force-dynamic";

/**
 * Edits a Purchase Order (CM-0015 §2): pending or rejected ones go back to
 * pending (or approved with Save & Approve); an approved, not-yet-ordered
 * one goes back to pending; an ordered or closed one is refused (409).
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
    const model = parseOrThrow(
      UpdateConstructionProcurementPurchaseOrderRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requirePurchaseOrderAccess(request, id, ["update"]);
    if (isResponse(session)) return session;
    await handlers.edit(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    );
    const po = await handlers.get(session.workspaceId, id);
    return Response.json(
      toPurchaseOrderDetailResponse(
        po,
        purchaseOrderActions(session.access, po),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
