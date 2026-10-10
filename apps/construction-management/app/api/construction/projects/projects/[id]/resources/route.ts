import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { projectResources } from "./handlers";
import { toResourcesResponse } from "./resources-models";

export const dynamic = "force-dynamic";

/**
 * A Project's Resources (CM-406): its Team Members (the Owner first),
 * Contractors, Suppliers and Vendors, each from the context that owns it.
 * 404 for another Company's Project or one the Member is not on.
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
      toResourcesResponse(await projectResources.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
