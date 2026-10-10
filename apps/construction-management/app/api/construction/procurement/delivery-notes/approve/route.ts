import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { actorOf } from "../../stores/central-store-access";
import { centralStore } from "../../stores/central-store-wiring";
import { ApproveConstructionProcurementDeliveryNotesRequestModel } from "../delivery-note-models";

export const dynamic = "force-dynamic";

/**
 * Bulk approve (Delivery Note approve): all or none in one transaction;
 * 409 `BULK_DECISION_REFUSED` lists the notes that are not pending.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "procurement.delivery_notes",
      "approve",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ApproveConstructionProcurementDeliveryNotesRequestModel.safeParse(
        await request.json(),
      ),
    );
    await centralStore.deliveryNotes.approve(actorOf(session), model.ids);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
