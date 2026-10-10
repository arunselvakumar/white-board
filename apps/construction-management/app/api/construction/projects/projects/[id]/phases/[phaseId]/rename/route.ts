import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { wingHandlers } from "../../../wings/handlers";
import {
  ConstructionProjectsPhaseParamsModel,
  RenameConstructionProjectsPhaseRequestModel,
  toPhaseResponse,
} from "../../../wings/wing-models";

export const dynamic = "force-dynamic";

/** Renames a Phase (CM-402); 409 `PHASE_CHANGED` on a stale `updatedAt`. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; phaseId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.wings", "update");
    if (isResponse(session)) return session;
    const { id, phaseId } = parseOrThrow(
      ConstructionProjectsPhaseParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      RenameConstructionProjectsPhaseRequestModel.safeParse(
        await request.json(),
      ),
    );
    const phase = await wingHandlers.renamePhase({
      viewer: session.access,
      projectId: id,
      phaseId,
      name: body.name,
      expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      by: session.userId,
    });
    return Response.json(toPhaseResponse(phase));
  } catch (error) {
    return mapError(error);
  }
}
