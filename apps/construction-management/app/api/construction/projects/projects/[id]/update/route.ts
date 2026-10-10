import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  projectHandlers as handlers,
  projectFinancial,
} from "../../../handlers";
import {
  ConstructionProjectsProjectParamsModel,
  toProjectResponse,
} from "../../project-models";
import { UpdateConstructionProjectsProjectRequestModel } from "./update-project-request-model";

export const dynamic = "force-dynamic";

/**
 * Edit Project (CM-204): every field at once; a contract detail or the
 * custom-field list left out keeps what is stored (CM-413), and without
 * the Financial flag the order value and the budget are kept; the Project
 * Type left out is kept too (CM-401). 409 `PROJECT_CHANGED` when
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
    const financial = projectFinancial(session.access);
    const updated = await handlers.update({
      viewer: session.access,
      id,
      by: session.userId,
      details,
      financial,
      expectedUpdatedAt: new Date(expectedUpdatedAt),
    });
    return Response.json(toProjectResponse(updated, financial));
  } catch (error) {
    return mapError(error);
  }
}
