import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionSiteWorkEquipmentSheetParamsModel,
  RejectConstructionSiteWorkEquipmentSheetRequestModel,
} from "../../equipment-sheet-models";
import {
  equipmentSheetHandlers as handlers,
  equipmentSheetResponse,
  requireEquipmentSheetAccess,
} from "../../handlers";

export const dynamic = "force-dynamic";

/** Rejects a pending Equipment Usage sheet with a reason (Reject on its Project). 409 `EQUIPMENT_SHEET_NOT_PENDING` otherwise. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkEquipmentSheetParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireEquipmentSheetAccess(request, id, "reject");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RejectConstructionSiteWorkEquipmentSheetRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.decide(
      session.access,
      id,
      { approve: false, reason: model.reason },
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt),
    );
    return await equipmentSheetResponse(session, id);
  } catch (error) {
    return mapError(error);
  }
}
