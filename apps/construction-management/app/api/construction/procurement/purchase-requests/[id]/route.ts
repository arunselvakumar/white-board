import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { purchaseRequestActions } from "@/src/procurement/application/purchase-request-handlers";

import {
  purchaseRequestHandlers as handlers,
  requirePurchaseRequestAccess,
} from "../handlers";
import {
  ConstructionProcurementPurchaseRequestParamsModel,
  toPurchaseRequestDetailResponse,
} from "../purchase-request-models";

export const dynamic = "force-dynamic";

/** One Purchase Request with its lines and linked Purchase Orders (read on its Project). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementPurchaseRequestParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requirePurchaseRequestAccess(request, id, "read");
    if (isResponse(session)) return session;
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
