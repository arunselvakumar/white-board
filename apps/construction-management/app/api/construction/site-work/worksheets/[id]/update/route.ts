import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { worksheetActions } from "@/src/site-work/application/worksheet-handlers";

import {
  requireWorksheetAccess,
  worksheetHandlers as handlers,
} from "../../handlers";
import {
  ConstructionSiteWorkWorksheetParamsModel,
  toWorksheetResponse,
  UpdateConstructionSiteWorkWorksheetRequestModel,
} from "../../worksheet-models";

export const dynamic = "force-dynamic";

/**
 * Edits a Daily Worksheet under the Project's current settings (CM-0016
 * §2, §3): its stock postings are replaced, and an approved or rejected
 * sheet goes back to pending (approved with Save & Approve). Needs update
 * on its Project (and Approve for Save & Approve).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkWorksheetParamsModel.safeParse(await context.params),
    );
    const session = await requireWorksheetAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionSiteWorkWorksheetRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.edit(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    );
    const sheet = await handlers.get(session.workspaceId, id);
    return Response.json(
      toWorksheetResponse(sheet, worksheetActions(session.access, sheet)),
    );
  } catch (error) {
    return mapError(error);
  }
}
