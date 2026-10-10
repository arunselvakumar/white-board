import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireNoteAccess } from "../delivery-note-access";
import {
  ConstructionProcurementDeliveryNoteParamsModel,
  toDeliveryNoteResponse,
} from "../delivery-note-models";

export const dynamic = "force-dynamic";

/** One live Delivery Note (Delivery Note read, or Material Requests read on its Project). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementDeliveryNoteParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireNoteAccess(request, id, "read", "read");
    if (isResponse(session)) return session;
    return Response.json(toDeliveryNoteResponse(session.note));
  } catch (error) {
    return mapError(error);
  }
}
