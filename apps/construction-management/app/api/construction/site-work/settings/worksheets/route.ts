import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  WORKSHEET_MENU,
  worksheetSettingsHandlers as handlers,
} from "../../worksheets/handlers";
import { toWorksheetSettingsResponse } from "../../worksheets/worksheet-models";
import {
  GetConstructionSiteWorkWorksheetSettingsRequestModel,
  SaveConstructionSiteWorkWorksheetSettingsRequestModel,
} from "../worksheet-settings-models";

export const dynamic = "force-dynamic";

/** A Project's worksheet settings, or the defaults (Daily Worksheet read on the Project). */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionSiteWorkWorksheetSettingsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, WORKSHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const settings = await handlers.get(session.workspaceId, model.projectId);
    return Response.json(
      toWorksheetSettingsResponse(model.projectId, settings),
    );
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Saves a Project's worksheet settings (Daily Worksheet update on the
 * Project). Saved sheets do not change.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      SaveConstructionSiteWorkWorksheetSettingsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, WORKSHEET_MENU, "update", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const { projectId, expectedUpdatedAt, ...input } = model;
    await handlers.save(
      session.access,
      projectId,
      input,
      expectedUpdatedAt === undefined
        ? undefined
        : expectedUpdatedAt == null
          ? null
          : new Date(expectedUpdatedAt),
    );
    const settings = await handlers.get(session.workspaceId, projectId);
    return Response.json(toWorksheetSettingsResponse(projectId, settings));
  } catch (error) {
    return mapError(error);
  }
}
