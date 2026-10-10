import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../../stores/central-store-access";
import { centralStore } from "../../../stores/central-store-wiring";
import { requireRequestAccess } from "../../material-request-access";
import {
  CloseConstructionProcurementMaterialRequestRequestModel,
  ConstructionProcurementMaterialRequestParamsModel,
  toMaterialRequestResponse,
} from "../../material-request-models";

export const dynamic = "force-dynamic";

/**
 * Close: the store ends what is left of an open request, with a reason
 * (Material Requests approve; ADR CM-0015 §11). Refused while a Delivery
 * Note is pending or in transit.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementMaterialRequestParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireRequestAccess(request, id, "approve", "any");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CloseConstructionProcurementMaterialRequestRequestModel.safeParse(
        await request.json(),
      ),
    );
    const closed = await centralStore.materialRequests.close(
      actorOf(session),
      id,
      model.reason,
      new Date(model.expectedUpdatedAt),
    );
    return Response.json(toMaterialRequestResponse(closed));
  } catch (error) {
    return mapError(error);
  }
}
