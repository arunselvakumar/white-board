import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { VISITS_MENU, visitHandlers as handlers } from "../../handlers";
import {
  AddConstructionMarketingVisitNoteRequestModel,
  ConstructionMarketingVisitParamsModel,
  toVisitResponse,
} from "../../visit-models";

export const dynamic = "force-dynamic";

/**
 * Adds a dated note to a Visit; notes are never edited, and can be added
 * past the lock. Needs Visits update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionMarketingVisitParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, VISITS_MENU, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      AddConstructionMarketingVisitNoteRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.addNote(session.access, id, model);
    return Response.json(
      toVisitResponse(await handlers.get(session.access, id)),
      {
        status: StatusCodes.CREATED,
      },
    );
  } catch (error) {
    return mapError(error);
  }
}
