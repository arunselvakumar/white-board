import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { wingHandlers } from "../../../wings/handlers";
import { ConstructionProjectsPhaseParamsModel } from "../../../wings/wing-models";

export const dynamic = "force-dynamic";

/** Deletes an empty Phase (CM-402); 409 `PHASE_NOT_EMPTY` while it holds Wings. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; phaseId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.wings", "delete");
    if (isResponse(session)) return session;
    const { id, phaseId } = parseOrThrow(
      ConstructionProjectsPhaseParamsModel.safeParse(await context.params),
    );
    await wingHandlers.deletePhase({
      viewer: session.access,
      projectId: id,
      phaseId,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
