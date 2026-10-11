import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { WORKSHEET_MENU, worksheetHandlers as handlers } from "../handlers";
import {
  GetConstructionSiteWorkWorksheetFormOptionsRequestModel,
  toFormOptionsResponse,
} from "../worksheet-models";

export const dynamic = "force-dynamic";

/**
 * What the Daily Worksheet form offers on a Project (CM-602): its
 * settings, the active Contractors on it with their Departments, those
 * Departments' Work Types (with assigned Materials) and the Measurement
 * Units. Needs Daily Worksheet read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionSiteWorkWorksheetFormOptionsRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, WORKSHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const options = await handlers.formOptions(
      session.workspaceId,
      model.projectId,
    );
    return Response.json(toFormOptionsResponse(model.projectId, options));
  } catch (error) {
    return mapError(error);
  }
}
