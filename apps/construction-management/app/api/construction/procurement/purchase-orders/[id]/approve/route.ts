import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseOrderActions } from "@/src/procurement/application/purchase-order-handlers";

import {
  purchaseOrderHandlers as handlers,
  requirePurchaseOrderAccess,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseOrderParamsModel,
  DecideConstructionProcurementPurchaseOrderRequestModel,
  toPurchaseOrderDetailResponse,
} from "../../purchase-order-models";

export const dynamic = "force-dynamic";

/** Approves a pending Purchase Order (Approve); 409 `PURCHASE_ORDER_NOT_PENDING` otherwise. */
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
    const session = await requirePurchaseOrderAccess(request, id, ["approve"]);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DecideConstructionProcurementPurchaseOrderRequestModel.safeParse(
        await request.json(),
      ),
    );
    const expected =
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt);
    await handlers.decide(session.access, id, { approve: true }, expected);
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
