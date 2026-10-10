import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { wingHandlers } from "./handlers";
import {
  CreateConstructionProjectsWingRequestModel,
  toWingResponse,
  toWingsResponse,
} from "./wing-models";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The Wings screen (CM-402): Phases in order with their Wings and totals. */
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
    return Response.json(
      toWingsResponse(await wingHandlers.overview(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Save on Add Wing (CM-402): the configuration and the floors and units
 * the editor made from it, in one request.
 */
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
      CreateConstructionProjectsWingRequestModel.safeParse(
        await request.json(),
      ),
    );
    const wing = await wingHandlers.create({
      viewer: session.access,
      projectId: id,
      phaseId: body.phaseId,
      type: body.type,
      name: body.name,
      config: body.config,
      floors: body.floors,
      by: session.userId,
    });
    return Response.json(toWingResponse(wing), { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
