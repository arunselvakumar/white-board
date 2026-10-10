import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHome, projectHomeFor } from "../../../../handlers";
import { ConstructionProjectsProjectParamsModel } from "../../../project-models";
import {
  UpdateConstructionProjectsHiddenModulesRequestModel,
  toProjectHomeResponse,
} from "../../home/home-models";

export const dynamic = "force-dynamic";

/**
 * Hide / Show Modules (CM-411): the full set of hidden modules on the
 * Project, for everyone on it. The Project menu's Update flag; answers
 * with the caller's home.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      UpdateConstructionProjectsHiddenModulesRequestModel.safeParse(
        await request.json(),
      ),
    );
    await projectHome.setHiddenModules({
      viewer: session.access,
      projectId: id,
      keys: body.hiddenModules,
    });
    return Response.json(
      toProjectHomeResponse(await projectHomeFor(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
