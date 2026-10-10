import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../central-store-access";
import { centralStore } from "../../central-store-wiring";
import {
  ConstructionProcurementStoreParamsModel,
  DeleteConstructionProcurementStoreRequestModel,
} from "../../store-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a store (Central store delete): refused (409 `STORE_IN_USE`)
 * while it holds stock, has open Material Requests, or Delivery Notes or
 * Material Transfers not yet delivered.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementStoreParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(
      request,
      "procurement.central_store",
      "delete",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionProcurementStoreRequestModel.safeParse(
        await request.json(),
      ),
    );
    await centralStore.stores.delete(
      actorOf(session),
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
