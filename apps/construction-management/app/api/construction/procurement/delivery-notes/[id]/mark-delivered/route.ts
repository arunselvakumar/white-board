import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../../stores/central-store-access";
import { centralStore } from "../../../stores/central-store-wiring";
import { requireNoteAccess } from "../../delivery-note-access";
import {
  ConstructionProcurementDeliveryNoteParamsModel,
  MarkConstructionProcurementDeliveryNoteDeliveredRequestModel,
  toDeliveryNoteResponse,
} from "../../delivery-note-models";

export const dynamic = "force-dynamic";

/**
 * Mark as Delivered (Delivery Note update, or Material Requests update on
 * the Project): posts Received from store at the Project and moves the
 * Material Request towards delivered.
 */
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
    const model = parseOrThrow(
      MarkConstructionProcurementDeliveryNoteDeliveredRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireNoteAccess(request, id, "update", "update");
    if (isResponse(session)) return session;
    const note = await centralStore.deliveryNotes.markDelivered(
      actorOf(session),
      id,
      model.deliveredOn,
      new Date(model.expectedUpdatedAt),
    );
    return Response.json(toDeliveryNoteResponse(note));
  } catch (error) {
    return mapError(error);
  }
}
