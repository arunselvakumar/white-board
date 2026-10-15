import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { WORKSHEET_MENU, worksheetHandlers as handlers } from "../handlers";
import {
  GetConstructionSiteWorkWorksheetTaskOptionsRequestModel,
  type GetConstructionSiteWorkWorksheetTaskOptionsResponseModel,
} from "../worksheet-models";

export const dynamic = "force-dynamic";

/**
 * The Daily Worksheet form's Task picker (CM-806): live leaf tasks of the
 * Project, searched by Task No. or name, at most 50. Needs Daily
 * Worksheet read on the Project (not Task read: the picker names tasks
 * only).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionSiteWorkWorksheetTaskOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, WORKSHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const tasks = await handlers.taskOptions(
      session.workspaceId,
      model.projectId,
      model.search ?? null,
    );
    const body: GetConstructionSiteWorkWorksheetTaskOptionsResponseModel = {
      items: tasks.map((task) => ({
        id: task.id,
        taskNo: task.taskNo,
        name: task.name,
        unitId: task.unitId,
        unitName: task.unitName,
      })),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
