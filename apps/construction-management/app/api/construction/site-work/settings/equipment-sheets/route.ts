import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { toEquipmentSheetSettingsResponse } from "../../equipment-sheets/equipment-sheet-models";
import {
  EQUIPMENT_SHEET_MENU,
  equipmentSheetSettingsHandlers as handlers,
} from "../../equipment-sheets/handlers";
import {
  GetConstructionSiteWorkEquipmentSheetSettingsRequestModel,
  SaveConstructionSiteWorkEquipmentSheetSettingsRequestModel,
} from "../equipment-sheet-settings-models";

export const dynamic = "force-dynamic";

/** A Project's equipment-sheet settings, or the defaults (Equipment Usage read on the Project). */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionSiteWorkEquipmentSheetSettingsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, EQUIPMENT_SHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const settings = await handlers.get(session.workspaceId, model.projectId);
    return Response.json(
      toEquipmentSheetSettingsResponse(model.projectId, settings),
    );
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Saves a Project's equipment-sheet settings (Equipment Usage update on
 * the Project). Saved sheets do not change.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      SaveConstructionSiteWorkEquipmentSheetSettingsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      EQUIPMENT_SHEET_MENU,
      "update",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const { projectId, expectedUpdatedAt, ...settings } = model;
    await handlers.save(
      session.access,
      projectId,
      settings,
      expectedUpdatedAt === undefined
        ? undefined
        : expectedUpdatedAt == null
          ? null
          : new Date(expectedUpdatedAt),
    );
    const saved = await handlers.get(session.workspaceId, projectId);
    return Response.json(toEquipmentSheetSettingsResponse(projectId, saved));
  } catch (error) {
    return mapError(error);
  }
}
