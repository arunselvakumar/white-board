import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionSiteWorkEquipmentSheetParamsModel,
  UpdateConstructionSiteWorkEquipmentSheetRequestModel,
} from "../../equipment-sheet-models";
import {
  equipmentSheetHandlers as handlers,
  equipmentSheetResponse,
  requireEquipmentSheetAccess,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Edits an Equipment Usage sheet under the Project's current settings
 * (CM-0016 §2, §3): the equipment stays, a new date is checked against
 * its availability, postings are replaced, and an approved or rejected
 * sheet goes back to pending. Needs update on its Project.
 */
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
    const session = await requireEquipmentSheetAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionSiteWorkEquipmentSheetRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.edit(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    );
    return await equipmentSheetResponse(session, id);
  } catch (error) {
    return mapError(error);
  }
}
