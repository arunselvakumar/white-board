import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { trackingProjectProgress } from "@/src/composition/project-progress";

import { projectHandlers as handlers } from "../../../handlers";
import type { ConstructionProjectsProjectProgressResponseModel } from "../../list-projects-models";
import { ConstructionProjectsProjectParamsModel } from "../../project-models";

export const dynamic = "force-dynamic";

const projectProgress = trackingProjectProgress();

/**
 * One Project's Project Progress % from Tasks (CM-805), for its home; null
 * without tasks. 404 for a Member not assigned to it, like the Project.
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
    await handlers.get(session.access, id);
    const progress = await projectProgress.progressOf(session.workspaceId, [
      id,
    ]);
    const body: ConstructionProjectsProjectProgressResponseModel = {
      progress: progress.get(id) ?? null,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
