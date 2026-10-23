import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../../stores/central-store-access";
import { centralStore } from "../../../stores/central-store-wiring";
import { requireRequestAccess } from "../../material-request-access";
import {
  AssignConstructionProcurementMaterialRequestWorkOrderRequestModel,
  ConstructionProcurementMaterialRequestParamsModel,
  toMaterialRequestResponse,
} from "../../material-request-models";

export const dynamic = "force-dynamic";

/**
 * Material reconciliation (CM-1110): names the Work Order a Contractor's
 * request was issued under, so its delivered quantities count towards
 * that Work Order. Material Requests update, on the Project; works after
 * Delivery Notes, which lock the request's own edit.
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
    const session = await requireRequestAccess(
      request,
      id,
      "update",
      "project",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      AssignConstructionProcurementMaterialRequestWorkOrderRequestModel.safeParse(
        await request.json(),
      ),
    );
    const assigned = await centralStore.materialRequests.assignWorkOrder(
      actorOf(session),
      id,
      model.workOrderId,
      model.expectedUpdatedAt == null
        ? null
        : new Date(model.expectedUpdatedAt),
    );
    return Response.json(toMaterialRequestResponse(assigned));
  } catch (error) {
    return mapError(error);
  }
}
