import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { hindranceActions } from "@/src/site-work/application/hindrance-handlers";

import {
  hindranceHandlers as handlers,
  requireHindranceAccess,
} from "../handlers";
import {
  ConstructionSiteWorkHindranceParamsModel,
  toHindranceResponse,
} from "../hindrance-models";

export const dynamic = "force-dynamic";

/** One hindrance with its sign-off (read on its Project). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkHindranceParamsModel.safeParse(await context.params),
    );
    const session = await requireHindranceAccess(request, id, "read");
    if (isResponse(session)) return session;
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
