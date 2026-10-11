import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { EQUIPMENT_MENU } from "@/src/site-work/application/equipment-handlers";

import { DeleteConstructionSiteWorkEquipmentRequestModel } from "../../equipment-models";
import { equipmentHandlers as handlers, equipmentIdOf } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Deletes equipment (a tombstone; Equipments Delete). Refused with 409
 * `EQUIPMENT_IN_USE` while it has live Equipment Usage sheets.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const id = await equipmentIdOf(context);
    const session = await requireAccess(request, EQUIPMENT_MENU, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionSiteWorkEquipmentRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
