import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsProjectParamsModel } from "../../project-models";
import { AddConstructionProjectsDrawingRequestModel } from "./drawing-models";
import { toDrawingDetailResponse } from "./drawing-responses";
import { projectDrawings } from "./handlers";

export const dynamic = "force-dynamic";

/**
 * Finishes uploading a new drawing (CM-408): records the file at `key` as
 * its R1 in `albumId`. 201 for a new drawing, 200 when the key was
 * already recorded (a retry).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "create");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProjectsProjectParamsModel.safeParse(await context.params),
    );
    const body = parseOrThrow(
      AddConstructionProjectsDrawingRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { drawing, created } = await projectDrawings.addDrawing({
      viewer: session.access,
      projectId: id,
      albumId: body.albumId,
      key: body.key,
      fileName: body.fileName,
      name: body.name,
      by: session.userId,
    });
    return Response.json(toDrawingDetailResponse(drawing), {
      status: created ? StatusCodes.CREATED : StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
