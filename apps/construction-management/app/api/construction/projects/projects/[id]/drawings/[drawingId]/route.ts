import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionProjectsDrawingParamsModel } from "../drawing-models";
import { toDrawingDetailResponse } from "../drawing-responses";
import { projectDrawings } from "../handlers";

export const dynamic = "force-dynamic";

/** A drawing with its revision history, newest first (CM-408). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; drawingId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "projects.drawings", "read");
    if (isResponse(session)) return session;
    const { id, drawingId } = parseOrThrow(
      ConstructionProjectsDrawingParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toDrawingDetailResponse(
        await projectDrawings.drawing(session.access, id, drawingId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
