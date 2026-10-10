import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseRequestActions } from "@/src/procurement/application/purchase-request-handlers";

import {
  purchaseRequestHandlers as handlers,
  requirePurchaseRequestAccess,
} from "../../handlers";
import {
  ConstructionProcurementPurchaseRequestParamsModel,
  toPurchaseRequestDetailResponse,
  UpdateConstructionProcurementPurchaseRequestRequestModel,
} from "../../purchase-request-models";

export const dynamic = "force-dynamic";

/**
 * Edits a pending or rejected Purchase Request (CM-0015 §2); a rejected
 * one goes back to pending, or approved with Save & Approve. Needs update
 * on its Project (and Approve for Save & Approve).
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
    const session = await requirePurchaseRequestAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionProcurementPurchaseRequestRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.edit(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
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
