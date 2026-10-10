import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectHome } from "../../../handlers";
import { ConstructionProjectsProjectParamsModel } from "../../project-models";

export const dynamic = "force-dynamic";

/** Pins a Project to the top of the caller's Projects home (CM-411); only for them. Fine when already pinned. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.project", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const pinned = await projectHome.setPinned({
      viewer: session.access,
      projectId: id,
      pinned: true,
    });
    return Response.json({ pinned });
  } catch (error) {
    return mapError(error);
  }
}
