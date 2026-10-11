import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAnyAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  canSeeRates,
  EQUIPMENT_USAGE_MENU,
} from "@/src/site-work/application/equipment-handlers";

import {
  GetConstructionSiteWorkEquipmentSheetOptionsRequestModel,
  toSheetOptionsResponse,
} from "../equipment-models";
import { equipmentHandlers as handlers } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The equipment that may take an Equipment Usage sheet at a Project on a
 * date (CM-0016 §11): there that day, not in maintenance that day, and
 * not marked unavailable — with its basis, method, fuel unit, hire terms
 * (rates with Financial) and last closing meter reading; and the
 * equipment there that may not, with why. Needs Equipment Usage Create or
 * Update on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionSiteWorkEquipmentSheetOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAnyAccess(
      request,
      EQUIPMENT_USAGE_MENU,
      ["create", "update"],
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const options = await handlers.sheetOptions(
      session.workspaceId,
      model.projectId,
      model.date,
    );
    return Response.json(
      toSheetOptionsResponse(
        model.projectId,
        model.date,
        options,
        canSeeRates(session.access, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
