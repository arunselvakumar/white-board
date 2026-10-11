import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  GetConstructionSiteWorkEquipmentSheetFormOptionsRequestModel,
  toEquipmentSheetFormOptionsResponse,
} from "../equipment-sheet-models";
import {
  EQUIPMENT_SHEET_MENU,
  equipmentSheetHandlers as handlers,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * What the Equipment Usage sheet form offers on a Project (CM-604) besides
 * the equipment (`GET /equipment/sheet-options`): its settings, the
 * supervisors, the active Contractors with their Departments, and the
 * units. Needs Equipment Usage read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionSiteWorkEquipmentSheetFormOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, EQUIPMENT_SHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const options = await handlers.formOptions(
      session.workspaceId,
      model.projectId,
    );
    return Response.json(
      toEquipmentSheetFormOptionsResponse(model.projectId, options),
    );
  } catch (error) {
    return mapError(error);
  }
}
