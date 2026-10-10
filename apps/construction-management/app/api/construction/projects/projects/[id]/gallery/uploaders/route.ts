import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../../project-models";
import { readableSources } from "../gallery-responses";
import { projectGallery } from "../handlers";

export const dynamic = "force-dynamic";

/** Everyone who uploaded a file the member can see in the Gallery, for the filter. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.gallery", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const items = await projectGallery.uploaders({
      viewer: session.access,
      projectId: id,
      sources: readableSources(session.access, id),
    });
    return Response.json({ items });
  } catch (error) {
    return mapError(error);
  }
}
