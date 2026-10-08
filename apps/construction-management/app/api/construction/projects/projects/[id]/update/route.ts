import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHandlers as handlers } from "../../../handlers";
import {
  ConstructionProjectsProjectParamsModel,
  toProjectResponse,
} from "../../project-models";
import { UpdateConstructionProjectsProjectRequestModel } from "./update-project-request-model";

export const dynamic = "force-dynamic";

/**
 * Edit Project (CM-204): every field at once. 409 `PROJECT_CHANGED` when
 * `expectedUpdatedAt` is stale; 404 for a Member not assigned to it.
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
    const { expectedUpdatedAt, ...details } = parseOrThrow(
      UpdateConstructionProjectsProjectRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await handlers.update({
      viewer: session.access,
      id,
      by: session.userId,
      details,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return Response.json(toProjectResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
