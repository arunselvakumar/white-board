import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectFinancial, projectLogos } from "../../../../handlers";
import {
  ConstructionProjectsProjectParamsModel,
  toProjectResponse,
} from "../../../project-models";

export const dynamic = "force-dynamic";

/**
 * Removes the Project logo (`projects.project` update); fine when there is
 * none. Answers the Project.
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
    const project = await projectLogos.remove({
      viewer: session.access,
      id,
      by: session.userId,
    });
    return Response.json(
      toProjectResponse(project, projectFinancial(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
