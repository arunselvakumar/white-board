import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseRequestActions } from "@/src/procurement/application/purchase-request-handlers";

import {
  purchaseRequestHandlers as handlers,
  requirePurchaseRequestAccess,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseRequestParamsModel,
  DecideConstructionProcurementPurchaseRequestRequestModel,
  toPurchaseRequestDetailResponse,
} from "../../purchase-request-models";

export const dynamic = "force-dynamic";

/** Approves a pending Purchase Request (Approve on its Project). 409 `PURCHASE_REQUEST_NOT_PENDING` otherwise. */
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
    const model = parseOrThrow(
      DecideConstructionProcurementPurchaseRequestRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requirePurchaseRequestAccess(request, id, "approve");
    if (isResponse(session)) return session;
    await handlers.decide(
      session.access,
      id,
      { approve: true },
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt),
    );
    const pr = await handlers.get(session.workspaceId, id);
    return Response.json(
      toPurchaseRequestDetailResponse(
        pr,
        purchaseRequestActions(session.access, pr),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
