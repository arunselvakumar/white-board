import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHandlers } from "../../../../handlers";
import { ConstructionProjectsProjectParamsModel } from "../../../project-models";
import {
  UpdateConstructionProjectsProjectDevelopmentsRequestModel,
  toProjectDevelopmentsResponse,
} from "../developments-models";
import { projectDevelopments } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Sets a Project's Amenities and Common Developments (CM-404): the full
 * set per kind sent; a kind left out keeps its rows. `projects.project`
 * Update; 404 for another Company's Project or one a Member is not on.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, "projects.project", "update");
    if (isResponse(session)) return session;
    const body = parseOrThrow(
      UpdateConstructionProjectsProjectDevelopmentsRequestModel.safeParse(
        await request.json(),
      ),
    );
    await projectHandlers.get(session.access, id);
    return Response.json(
      toProjectDevelopmentsResponse(
        await projectDevelopments.assign({
          workspaceId: session.workspaceId,
          projectId: id,
          ids: {
            amenity: body.amenityIds,
            common_development: body.commonDevelopmentIds,
          },
          by: session.userId,
        }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
