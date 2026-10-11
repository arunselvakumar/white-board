import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requireWorksheetAccess,
  worksheetHandlers as handlers,
} from "../../handlers";
import {
  ConstructionSiteWorkWorksheetParamsModel,
  DeleteConstructionSiteWorkWorksheetRequestModel,
} from "../../worksheet-models";

export const dynamic = "force-dynamic";

/** Deletes a Daily Worksheet and reverses its stock postings (delete on its Project). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkWorksheetParamsModel.safeParse(await context.params),
    );
    const session = await requireWorksheetAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionSiteWorkWorksheetRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
