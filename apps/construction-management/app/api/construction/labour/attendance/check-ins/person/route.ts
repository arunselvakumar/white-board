import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  GetConstructionLabourCheckInPersonRequestModel,
  type GetConstructionLabourCheckInPersonResponseModel,
} from "../check-in-models";
import {
  checkInHandlers as handlers,
  toContextResponse,
  toEntryResponse,
  toPersonResponse,
  viewerOf,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The capture screen: one person who may be checked in on the Project
 * (refused as recording refuses them), where they stand, and their
 * entries of today's attendance day and of a still open earlier one,
 * oldest first, voided ones included. Needs Attendance read on the
 * Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionLabourCheckInPersonRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const found = await handlers.capture(
      session.workspaceId,
      model.projectId,
      model.kind,
      model.personId,
      viewerOf(session.access, model.projectId),
    );
    const body: GetConstructionLabourCheckInPersonResponseModel = {
      ...toContextResponse(found),
      person: toPersonResponse(found.person),
      entries: found.entries.map(toEntryResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
