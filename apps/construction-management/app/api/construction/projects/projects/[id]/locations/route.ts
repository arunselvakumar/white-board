import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { locationHandlers } from "./handlers";
import {
  CreateConstructionProjectsLocationRequestModel,
  toLocationResponse,
} from "./location-models";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** The Project's Locations in order (CM-405). */
export async function GET(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.locations", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const items = await locationHandlers.list(session.access, id);
    return Response.json({ items: items.map(toLocationResponse) });
  } catch (error) {
    return mapError(error);
  }
}

/** Add Location, at the end of the list (CM-405). */
export async function POST(
  request: Request,
  context: Context,
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.locations",
      "create",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const details = parseOrThrow(
      CreateConstructionProjectsLocationRequestModel.safeParse(
        await request.json(),
      ),
    );
    const location = await locationHandlers.create({
      viewer: session.access,
      projectId: id,
      details,
      by: session.userId,
    });
    return Response.json(toLocationResponse(location), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
