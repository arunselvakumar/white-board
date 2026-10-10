import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../../stores/central-store-access";
import { centralStore } from "../../../stores/central-store-wiring";
import { requireNoteAccess } from "../../delivery-note-access";
import {
  ConstructionProcurementDeliveryNoteParamsModel,
  toDeliveryNoteResponse,
} from "../../delivery-note-models";

export const dynamic = "force-dynamic";

/**
 * Approve = dispatch (Delivery Note approve): posts Issued at the store on
 * the note's date; 409 `STOCK_INSUFFICIENT` when the store is short on
 * that date or any later one.
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
    const session = await requireNoteAccess(request, id, "approve");
    if (isResponse(session)) return session;
    await centralStore.deliveryNotes.approve(actorOf(session), [id]);
    const note = await centralStore.deliveryNotes.get(session.workspaceId, id);
    return Response.json(toDeliveryNoteResponse(note ?? session.note));
  } catch (error) {
    return mapError(error);
  }
}
