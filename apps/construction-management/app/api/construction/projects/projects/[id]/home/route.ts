import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHomeFor } from "../../../handlers";
import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { toProjectHomeResponse } from "./home-models";

export const dynamic = "force-dynamic";

/**
 * A Project's home (CM-411): the modules the caller may read, in their
 * tile order, Wings and Locations by the Project's structure, hidden
 * modules left out (or marked, for the Project menu's Update flag).
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
    return Response.json(
      toProjectHomeResponse(await projectHomeFor(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
