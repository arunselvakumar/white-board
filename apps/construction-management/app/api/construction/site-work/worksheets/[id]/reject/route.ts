import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { worksheetActions } from "@/src/site-work/application/worksheet-handlers";

import {
  requireWorksheetAccess,
  worksheetHandlers as handlers,
} from "../../handlers";
import {
  ConstructionSiteWorkWorksheetParamsModel,
  RejectConstructionSiteWorkWorksheetRequestModel,
  toWorksheetResponse,
} from "../../worksheet-models";

export const dynamic = "force-dynamic";

/** Rejects a pending Daily Worksheet with a reason (Reject on its Project). 409 `WORKSHEET_NOT_PENDING` otherwise. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkWorksheetParamsModel.safeParse(await context.params),
    );
    const session = await requireWorksheetAccess(request, id, "reject");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      RejectConstructionSiteWorkWorksheetRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.decide(
      session.access,
      id,
      { approve: false, reason: model.reason },
      model.expectedUpdatedAt == null
        ? undefined
        : new Date(model.expectedUpdatedAt),
    );
    const sheet = await handlers.get(session.workspaceId, id);
    return Response.json(
      toWorksheetResponse(sheet, worksheetActions(session.access, sheet)),
    );
  } catch (error) {
    return mapError(error);
  }
}
