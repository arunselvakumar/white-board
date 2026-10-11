import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { WORKSHEET_MENU, worksheetHandlers as handlers } from "../handlers";
import {
  GetConstructionSiteWorkWorksheetAvailableStockRequestModel,
  type GetConstructionSiteWorkWorksheetAvailableStockResponseModel,
} from "../worksheet-models";

export const dynamic = "force-dynamic";

/**
 * Stock per material at the Project on the sheet date, shown next to
 * each material line (CM-0016 §5). When editing, the sheet's own
 * consumption is added back. Needs Daily Worksheet read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const model = parseOrThrow(
      GetConstructionSiteWorkWorksheetAvailableStockRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const session = await requireAccess(request, WORKSHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const stock = await handlers.availableStock(
      session.workspaceId,
      model.projectId,
      model.date,
      model.materialIds,
      model.excludeWorksheetId ?? null,
    );
    const body: GetConstructionSiteWorkWorksheetAvailableStockResponseModel = {
      stock: Object.fromEntries(stock),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
