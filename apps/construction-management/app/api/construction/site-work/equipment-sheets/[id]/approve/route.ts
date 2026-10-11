import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionSiteWorkEquipmentSheetParamsModel,
  DecideConstructionSiteWorkEquipmentSheetRequestModel,
} from "../../equipment-sheet-models";
import {
  equipmentSheetHandlers as handlers,
  equipmentSheetResponse,
  requireEquipmentSheetAccess,
} from "../../handlers";

export const dynamic = "force-dynamic";

/** Approves a pending Equipment Usage sheet (Approve on its Project); a rented one accrues its hire. 409 `EQUIPMENT_SHEET_NOT_PENDING` otherwise. */
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
    const session = await requireEquipmentSheetAccess(request, id, "approve");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DecideConstructionSiteWorkEquipmentSheetRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.decide(
      session.access,
      id,
      { approve: true },
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt),
    );
    return await equipmentSheetResponse(session, id);
  } catch (error) {
    return mapError(error);
  }
}
