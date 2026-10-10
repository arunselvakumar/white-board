import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../../stores/central-store-access";
import { centralStore } from "../../../stores/central-store-wiring";
import { requireNoteAccess } from "../../delivery-note-access";
import {
  ConstructionProcurementDeliveryNoteParamsModel,
  toDeliveryNoteResponse,
  UpdateConstructionProcurementDeliveryNoteRequestModel,
} from "../../delivery-note-models";

export const dynamic = "force-dynamic";

/** Edits a pending Delivery Note (Delivery Note update); 409 once approved. */
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
    const { expectedUpdatedAt, ...input } = parseOrThrow(
      UpdateConstructionProcurementDeliveryNoteRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireNoteAccess(request, id, "update");
    if (isResponse(session)) return session;
    const note = await centralStore.deliveryNotes.update(
      actorOf(session),
      id,
      input,
      new Date(expectedUpdatedAt),
    );
    return Response.json(toDeliveryNoteResponse(note));
  } catch (error) {
    return mapError(error);
  }
}
