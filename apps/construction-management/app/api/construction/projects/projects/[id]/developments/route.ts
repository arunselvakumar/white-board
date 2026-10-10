import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHandlers } from "../../../handlers";
import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { toProjectDevelopmentsResponse } from "./developments-models";
import { projectDevelopments } from "./handlers";

export const dynamic = "force-dynamic";

/**
 * A Project's Amenities and Common Developments (CM-404), with what can be
 * added. `projects.project` Read; 404 for another Company's Project or one
 * a Member is not on.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    await projectHandlers.get(session.access, id);
    return Response.json(
      toProjectDevelopmentsResponse(
        await projectDevelopments.forProject(session.workspaceId, id),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
