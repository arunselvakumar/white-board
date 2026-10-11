import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { canReadEquipment } from "@/src/site-work/application/equipment-handlers";

import {
  detailResponse,
  equipmentHandlers as handlers,
  equipmentIdOf,
  requireEquipmentAccess,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * One machine with its Transfer Report and maintenance log. Needs
 * Equipments Read, or Equipment Usage Read on the Project it is at.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const id = await equipmentIdOf(context);
    const session = await requireEquipmentAccess(
      request,
      async (access) =>
        canReadEquipment(access, await handlers.find(access.workspaceId, id)),
      { write: false },
    );
    if (isResponse(session)) return session;
    return await detailResponse(session.access, id);
  } catch (error) {
    return mapError(error);
  }
}
