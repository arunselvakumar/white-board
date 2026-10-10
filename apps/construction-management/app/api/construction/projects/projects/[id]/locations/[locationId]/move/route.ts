import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { locationHandlers } from "../../handlers";
import {
  ConstructionProjectsLocationParamsModel,
  MoveConstructionProjectsLocationRequestModel,
  toLocationResponse,
} from "../../location-models";

export const dynamic = "force-dynamic";

/** Moves a Location up or down one place (CM-405); answers the new order. */
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
    const { direction } = parseOrThrow(
      MoveConstructionProjectsLocationRequestModel.safeParse(
        await request.json(),
      ),
    );
    const items = await locationHandlers.move({
      viewer: session.access,
      projectId: id,
      locationId,
      direction,
      by: session.userId,
    });
    return Response.json({ items: items.map(toLocationResponse) });
  } catch (error) {
    return mapError(error);
  }
}
