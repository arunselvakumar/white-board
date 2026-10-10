import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { wingHandlers } from "../../handlers";
import {
  ConstructionProjectsWingParamsModel,
  UpdateConstructionProjectsWingRequestModel,
  toWingResponse,
} from "../../wing-models";

export const dynamic = "force-dynamic";

/**
 * Save on Edit Wing (CM-402): name, Phase and every floor the Wing keeps.
 * Rows keep their ids; 409 `WING_CHANGED` when `expectedUpdatedAt` is stale.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; wingId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.wings", "update");
    if (isResponse(session)) return session;
    const { id, wingId } = parseOrThrow(
      ConstructionProjectsWingParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      UpdateConstructionProjectsWingRequestModel.safeParse(
        await request.json(),
      ),
    );
    const wing = await wingHandlers.update({
      viewer: session.access,
      projectId: id,
      wingId,
      phaseId: body.phaseId,
      name: body.name,
      floors: body.floors,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      by: session.userId,
    });
    return Response.json(toWingResponse(wing));
  } catch (error) {
    return mapError(error);
  }
}
