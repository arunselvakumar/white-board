import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { inspectionResponse, requireInspectionAccess } from "../handlers";
import { ConstructionTrackingInspectionParamsModel } from "../inspection-models";

export const dynamic = "force-dynamic";

/**
 * One Inspection Request with its linked drawings, re-inspection links and
 * the snags raised from it (read on its Project).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingInspectionParamsModel.safeParse(await context.params),
    );
    const session = await requireInspectionAccess(request, id, "read");
    if (isResponse(session)) return session;
    return Response.json(await inspectionResponse(session, id));
  } catch (error) {
    return mapError(error);
  }
}
