import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  inspectionHandlers as handlers,
  requireInspectionAccess,
} from "../../handlers";
import {
  AddConstructionTrackingInspectionObservationRequestModel,
  ConstructionTrackingInspectionParamsModel,
  toObservationResponse,
  type ListConstructionTrackingInspectionObservationsResponse,
} from "../../inspection-models";

export const dynamic = "force-dynamic";

/** A request's observations, oldest first (read on its Project). */
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
    const viewer = await handlers.viewer(session.access);
    const items = await handlers.observations(viewer, session.target);
    const body: ListConstructionTrackingInspectionObservationsResponse = {
      items: items.map(toObservationResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Adds an observation while the request is pending: by the inspector, or
 * anyone with Update (403 otherwise; 409 `INSPECTION_DECIDED` once
 * decided). Text, or `withFiles` when photos / files follow.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionTrackingInspectionParamsModel.safeParse(await context.params),
    );
    const session = await requireInspectionAccess(request, id, "read");
    if (isResponse(session)) return session;
    const ended = await requirePlanActive(session);
    if (ended != null) return ended;
    const model = parseOrThrow(
      AddConstructionTrackingInspectionObservationRequestModel.safeParse(
        await request.json(),
      ),
    );
    const observationId = await handlers.addObservation(
      session.access,
      id,
      model,
    );
    const viewer = await handlers.viewer(session.access);
    const items = await handlers.observations(
      viewer,
      await handlers.find(session.workspaceId, id),
    );
    const added = items.find((item) => item.id === observationId);
    if (added == null) throw new Error("The observation was not saved.");
    return Response.json(toObservationResponse(added), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
