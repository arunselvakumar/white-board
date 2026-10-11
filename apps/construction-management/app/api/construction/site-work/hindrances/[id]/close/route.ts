import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { hindranceActions } from "@/src/site-work/application/hindrance-handlers";

import {
  hindranceHandlers as handlers,
  requireHindranceAccess,
} from "../../handlers";
import {
  ConstructionSiteWorkHindranceParamsModel,
  CloseConstructionSiteWorkHindranceRequestModel,
  toHindranceResponse,
} from "../../hindrance-models";

export const dynamic = "force-dynamic";

/**
 * **Close** an open hindrance: its end date and, when given, the hours
 * lost (CM-607). Needs update on its Project; 409 `HINDRANCE_CLOSED` when
 * it already has an end date.
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
      CloseConstructionSiteWorkHindranceRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.close(
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
