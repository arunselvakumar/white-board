import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { hindranceActions } from "@/src/site-work/application/hindrance-handlers";

import {
  hindranceHandlers as handlers,
  requireHindranceAccess,
} from "../../handlers";
import {
  ConstructionSiteWorkHindranceParamsModel,
  UpdateConstructionSiteWorkHindranceRequestModel,
  toHindranceResponse,
} from "../../hindrance-models";

export const dynamic = "force-dynamic";

/**
 * Edits a hindrance (CM-607). The back-dated edit limit applies to the old
 * start date and a new one. Needs update on its Project; 409
 * `HINDRANCE_CHANGED` when stale.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkHindranceParamsModel.safeParse(await context.params),
    );
    const session = await requireHindranceAccess(request, id, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionSiteWorkHindranceRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.edit(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
      model,
    );
    const hindrance = await handlers.get(session.workspaceId, id);
    return Response.json(
      toHindranceResponse(
        hindrance,
        hindranceActions(session.access, hindrance),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
