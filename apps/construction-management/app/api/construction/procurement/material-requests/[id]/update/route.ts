import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../../stores/central-store-access";
import { centralStore } from "../../../stores/central-store-wiring";
import { requireRequestAccess } from "../../material-request-access";
import {
  ConstructionProcurementMaterialRequestParamsModel,
  toMaterialRequestResponse,
  UpdateConstructionProcurementMaterialRequestRequestModel,
} from "../../material-request-models";

export const dynamic = "force-dynamic";

/**
 * Edits a Material Request while no Delivery Note exists (update, and on
 * the Project); 409 `MATERIAL_REQUEST_HAS_DELIVERY_NOTES` after.
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
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionProcurementMaterialRequestRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await centralStore.materialRequests.update(
      actorOf(session),
      id,
      input,
      new Date(expectedUpdatedAt),
    );
    return Response.json(toMaterialRequestResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
