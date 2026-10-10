import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { imageResponse, readUpload } from "@/app/api/_lib/uploads";
import { IMAGE_LIMITS } from "@/src/shared-kernel/files";

import { projectFinancial, projectLogos } from "../../../handlers";
import {
  ConstructionProjectsProjectParamsModel,
  toProjectResponse,
} from "../../project-models";

export const dynamic = "force-dynamic";

/**
 * The Project logo (CM-401), streamed from storage to those who may see
 * the Project (`projects.project` read; a Member only on their Projects).
 * There is no public URL.
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
    return imageResponse(await projectLogos.read(session.access, id));
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Sets or replaces the Project logo (`projects.project` update). The body
 * is the image itself with its `content-type`: PNG, JPEG or WebP, at most
 * 2 MB. Answers the Project.
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
    const upload = await readUpload(request, IMAGE_LIMITS.project_logo);
    const project = await projectLogos.set({
      viewer: session.access,
      id,
      by: session.userId,
      bytes: upload.bytes,
      contentType: upload.contentType,
    });
    return Response.json(
      toProjectResponse(project, projectFinancial(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
