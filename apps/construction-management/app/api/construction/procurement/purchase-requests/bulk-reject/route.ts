import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PURCHASE_REQUEST_MENU,
  purchaseRequestHandlers as handlers,
} from "../handlers";
import {
  BulkRejectConstructionProcurementPurchaseRequestsRequestModel,
  type BulkDecideConstructionProcurementPurchaseRequestsResponseModel,
} from "../purchase-request-models";
import type { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Rejects several pending Purchase Requests of one Project at once, with one reason. All or none (CM-0015 §2): if any is not
 * pending or not the Project's, nothing changes and 409
 * `BULK_DECISION_REFUSED` lists each refusal. Needs reject on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      BulkRejectConstructionProcurementPurchaseRequestsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      PURCHASE_REQUEST_MENU,
      "reject",
      {
        projectId: model.projectId,
      },
    );
    if (isResponse(session)) return session;
    const decided = await handlers.bulkDecide(
      session.access,
      model.projectId,
      model.ids,
      { approve: false, reason: model.reason },
    );
    const body: z.infer<
      typeof BulkDecideConstructionProcurementPurchaseRequestsResponseModel
    > = {
      decided,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
