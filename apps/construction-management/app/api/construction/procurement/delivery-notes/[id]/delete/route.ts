import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../../stores/central-store-access";
import { centralStore } from "../../../stores/central-store-wiring";
import { requireNoteAccess } from "../../delivery-note-access";
import {
  ConstructionProcurementDeliveryNoteParamsModel,
  DeleteConstructionProcurementDeliveryNoteRequestModel,
} from "../../delivery-note-models";

export const dynamic = "force-dynamic";

/** Deletes a pending Delivery Note (Delivery Note delete); 409 once approved. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementDeliveryNoteParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireNoteAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionProcurementDeliveryNoteRequestModel.safeParse(
        await request.json(),
      ),
    );
    await centralStore.deliveryNotes.delete(
      actorOf(session),
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
