import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { wingHandlers } from "../wings/handlers";
import {
  CreateConstructionProjectsPhaseRequestModel,
  toPhaseResponse,
} from "../wings/wing-models";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The Project's Phases in order, with their Wing counts (CM-402). */
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.wings", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const items = await wingHandlers.listPhases(session.access, id);
    return Response.json({ items: items.map(toPhaseResponse) });
  } catch (error) {
    return mapError(error);
  }
}

/** Add Phase, after the last one (CM-402). */
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.wings", "create");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      CreateConstructionProjectsPhaseRequestModel.safeParse(
        await request.json(),
      ),
    );
    const phase = await wingHandlers.createPhase({
      viewer: session.access,
      projectId: id,
      name: body.name,
      by: session.userId,
    });
    return Response.json(toPhaseResponse(phase), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
