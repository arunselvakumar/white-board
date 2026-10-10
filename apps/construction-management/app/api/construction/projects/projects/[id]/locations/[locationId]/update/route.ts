import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { locationHandlers } from "../../handlers";
import {
  ConstructionProjectsLocationParamsModel,
  UpdateConstructionProjectsLocationRequestModel,
  toLocationResponse,
} from "../../location-models";

export const dynamic = "force-dynamic";

/** Edits a Location (CM-405); 409 `LOCATION_CHANGED` on a stale `updatedAt`. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; locationId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.locations",
      "update",
    );
    if (isResponse(session)) return session;
    const { id, locationId } = parseOrThrow(
      ConstructionProjectsLocationParamsModel.safeParse(await context.params),
    );
    const { expectedUpdatedAt, ...details } = parseOrThrow(
      UpdateConstructionProjectsLocationRequestModel.safeParse(
        await request.json(),
      ),
    );
    const location = await locationHandlers.update({
      viewer: session.access,
      projectId: id,
      locationId,
      details,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      by: session.userId,
    });
    return Response.json(toLocationResponse(location));
  } catch (error) {
    return mapError(error);
  }
}
