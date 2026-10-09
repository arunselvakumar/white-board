import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../../../project-models";
import { projectDocuments } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Step 2, deployed (CM-414): the `handleUploadUrl` that `uploadPresigned()`
 * from `@vercel/blob/client` calls for a presigned URL to one key of this
 * Project. 404 where storage is files on disk.
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
    const body: unknown = await request.json();
    return Response.json(
      await projectDocuments.answerDirectUpload({
        viewer: session.access,
        projectId: id,
        request,
        body,
      }),
    );
  } catch (error) {
    return mapError(error);
  }
}
