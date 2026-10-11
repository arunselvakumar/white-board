import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { WORKSHEET_MENU, worksheetHandlers as handlers } from "../handlers";
import {
  GetConstructionSiteWorkWorksheetAttendanceRequestModel,
  toAttendanceResponse,
} from "../worksheet-models";

export const dynamic = "force-dynamic";

/**
 * The "Attendance on <date>" panel of the worksheet form (CM-0016 §6):
 * the Project's labour and vendor attendance heads by skill, the heads on
 * its other live worksheets that date, and what remains. Needs Daily
 * Worksheet read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionSiteWorkWorksheetAttendanceRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, WORKSHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const prefill = await handlers.prefill(
      session.workspaceId,
      model.projectId,
      model.date,
      model.excludeWorksheetId ?? null,
    );
    return Response.json(toAttendanceResponse(model.date, prefill));
  } catch (error) {
    return mapError(error);
  }
}
