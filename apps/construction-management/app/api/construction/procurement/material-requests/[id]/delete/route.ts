import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../../stores/central-store-access";
import { centralStore } from "../../../stores/central-store-wiring";
import { requireRequestAccess } from "../../material-request-access";
import {
  ConstructionProcurementMaterialRequestParamsModel,
  DeleteConstructionProcurementMaterialRequestRequestModel,
} from "../../material-request-models";

export const dynamic = "force-dynamic";

/** Deletes a Material Request with no Delivery Note (delete, and on the Project). */
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
      "delete",
      "project",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionProcurementMaterialRequestRequestModel.safeParse(
        await request.json(),
      ),
    );
    await centralStore.materialRequests.delete(
      actorOf(session),
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
