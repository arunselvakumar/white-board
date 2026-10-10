import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHandlers } from "../../../handlers";
import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { projectLocations } from "./handlers";
import { toLocationOptionsResponse } from "./location-options-models";

export const dynamic = "force-dynamic";

/**
 * What a site entry's location picker offers on a Project (CM-403).
 * `projects.project` Read; 404 for another Company's Project or one a
 * Member is not on.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const project = await projectHandlers.get(session.access, id);
    return Response.json(
      toLocationOptionsResponse(
        project.structure,
        await projectLocations.options(session.workspaceId, id),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
