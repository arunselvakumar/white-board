import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { locationHandlers } from "../../handlers";
import { ConstructionProjectsLocationParamsModel } from "../../location-models";

export const dynamic = "force-dynamic";

/** Deletes a Location (CM-405): a tombstone; 409 `LOCATION_IN_USE` when used. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; locationId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.locations",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id, locationId } = parseOrThrow(
      ConstructionProjectsLocationParamsModel.safeParse(await context.params),
    );
    await locationHandlers.delete({
      viewer: session.access,
      projectId: id,
      locationId,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
