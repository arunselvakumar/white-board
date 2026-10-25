import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  projectHandlers as handlers,
  projectFinancial,
} from "../../../../handlers";
import {
  ConstructionProjectsProjectParamsModel,
  toProjectResponse,
} from "../../../project-models";
import { UpdateConstructionProjectsProjectColorRequestModel } from "./update-project-color-request-model";

export const dynamic = "force-dynamic";

/**
 * Change colour (ADR CM-0026 §5): only the folder's colour, from the kebab
 * on the Projects home, with the same permission as Edit. No
 * `expectedUpdatedAt`, since nothing else changes; 404 for a Member not
 * assigned to the Project.
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
    const { color } = parseOrThrow(
      UpdateConstructionProjectsProjectColorRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await handlers.setColor({
      viewer: session.access,
      id,
      by: session.userId,
      color,
    });
    return Response.json(
      toProjectResponse(updated, projectFinancial(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
