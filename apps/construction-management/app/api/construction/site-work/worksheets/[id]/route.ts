import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { worksheetActions } from "@/src/site-work/application/worksheet-handlers";

import {
  requireWorksheetAccess,
  worksheetHandlers as handlers,
} from "../handlers";
import {
  ConstructionSiteWorkWorksheetParamsModel,
  toWorksheetResponse,
} from "../worksheet-models";

export const dynamic = "force-dynamic";

/** One Daily Worksheet with the names of what it points at (read on its Project). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkWorksheetParamsModel.safeParse(await context.params),
    );
    const session = await requireWorksheetAccess(request, id, "read");
    if (isResponse(session)) return session;
    const sheet = await handlers.get(session.workspaceId, id);
    return Response.json(
      toWorksheetResponse(sheet, worksheetActions(session.access, sheet)),
    );
  } catch (error) {
    return mapError(error);
  }
}
