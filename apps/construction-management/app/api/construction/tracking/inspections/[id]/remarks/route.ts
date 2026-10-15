import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requirePlanActive } from "@/app/api/_lib/require-plan-active";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  inspectionHandlers as handlers,
  requireInspectionAccess,
} from "../../handlers";
import {
  AddConstructionTrackingInspectionRemarkRequestModel,
  ConstructionTrackingInspectionParamsModel,
  toRemarkResponse,
  type ListConstructionTrackingInspectionRemarksResponse,
} from "../../inspection-models";

export const dynamic = "force-dynamic";

/** A request's remarks, oldest first (read on its Project). */
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
    const items = await handlers.remarks(session.workspaceId, id);
    const body: ListConstructionTrackingInspectionRemarksResponse = {
      items: items.map(toRemarkResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a remark: text, at any time, by anyone who can read the request. */
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
      AddConstructionTrackingInspectionRemarkRequestModel.safeParse(
        await request.json(),
      ),
    );
    const remarkId = await handlers.addRemark(session.access, id, model.body);
    const items = await handlers.remarks(session.workspaceId, id);
    const added = items.find((item) => item.id === remarkId);
    if (added == null) throw new Error("The remark was not saved.");
    return Response.json(toRemarkResponse(added), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
