import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseOrderActions } from "@/src/procurement/application/purchase-order-handlers";

import {
  purchaseOrderHandlers as handlers,
  requirePurchaseOrderAccess,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseOrderParamsModel,
  RejectConstructionProcurementPurchaseOrderRequestModel,
  toPurchaseOrderDetailResponse,
} from "../../purchase-order-models";

export const dynamic = "force-dynamic";

/** Rejects a pending Purchase Order with a reason (Reject); its PR stops counting the quantities. */
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
    const session = await requirePurchaseOrderAccess(request, id, ["reject"]);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RejectConstructionProcurementPurchaseOrderRequestModel.safeParse(
        await request.json(),
      ),
    );
    const expected =
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt);
    await handlers.decide(
      session.access,
      id,
      { approve: false, reason: model.reason },
      expected,
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
