import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PURCHASE_REQUEST_MENU,
  purchaseRequestHandlers as handlers,
} from "../handlers";
import {
  GetConstructionProcurementPurchaseRequestQuantityInfoRequestModel,
  toQuantityInfoResponse,
} from "../purchase-request-models";

export const dynamic = "force-dynamic";

/**
 * Available Stock and Balanced estimated qty per material at the Project,
 * for step 2 of the Purchase Request wizard and the PO line sheet. Needs
 * Purchase Request read, or Purchase Order read, on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionProcurementPurchaseRequestQuantityInfoRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    let session = await requireAccess(request, PURCHASE_REQUEST_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session) && session.status === 403) {
      const fallback = await requireAccess(
        request,
        "procurement.purchase_orders",
        "read",
        {
          projectId: model.projectId,
        },
      );
      if (!isResponse(fallback)) session = fallback;
    }
    if (isResponse(session)) return session;
    const items = await handlers.quantityInfo(
      session.workspaceId,
      model.projectId,
      model.materialIds,
      model.excludePurchaseRequestId ?? null,
    );
    return Response.json(toQuantityInfoResponse(items));
  } catch (error) {
    return mapError(error);
  }
}
