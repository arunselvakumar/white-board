import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  hindranceHandlers as handlers,
  requireHindranceAccess,
} from "../../handlers";
import {
  ConstructionSiteWorkHindranceParamsModel,
  DeleteConstructionSiteWorkHindranceRequestModel,
} from "../../hindrance-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a hindrance (a tombstone; its number is never reused). Needs
 * delete on its Project; the back-dated edit limit applies to its start.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkHindranceParamsModel.safeParse(await context.params),
    );
    const session = await requireHindranceAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionSiteWorkHindranceRequestModel.safeParse(
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
