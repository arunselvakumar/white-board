import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  inspectionHandlers as handlers,
  requireInspectionAccess,
} from "../../handlers";
import {
  ConstructionTrackingInspectionParamsModel,
  DeleteConstructionTrackingInspectionRequestModel,
} from "../../inspection-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a pending Inspection Request (a tombstone; its number is never
 * reused). A decided one cannot be deleted: 409 `INSPECTION_DECIDED`.
 * Needs Delete on its Project.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingInspectionParamsModel.safeParse(await context.params),
    );
    const session = await requireInspectionAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionTrackingInspectionRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
