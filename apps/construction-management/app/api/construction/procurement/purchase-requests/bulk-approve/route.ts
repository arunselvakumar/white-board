import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  PURCHASE_REQUEST_MENU,
  purchaseRequestHandlers as handlers,
} from "../handlers";
import {
  BulkApproveConstructionProcurementPurchaseRequestsRequestModel,
  type BulkDecideConstructionProcurementPurchaseRequestsResponseModel,
} from "../purchase-request-models";
import type { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * Approves several pending Purchase Requests of one Project at once. All or none (CM-0015 §2): if any is not
 * pending or not the Project's, nothing changes and 409
 * `BULK_DECISION_REFUSED` lists each refusal. Needs approve on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      BulkApproveConstructionProcurementPurchaseRequestsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      PURCHASE_REQUEST_MENU,
      "approve",
      {
        projectId: model.projectId,
      },
    );
    if (isResponse(session)) return session;
    const decided = await handlers.bulkDecide(
      session.access,
      model.projectId,
      model.ids,
      { approve: true },
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
