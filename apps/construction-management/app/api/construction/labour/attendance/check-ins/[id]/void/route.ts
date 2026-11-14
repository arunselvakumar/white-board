import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";

import {
  ConstructionLabourCheckInParamsModel,
  VoidConstructionLabourCheckInRequestModel,
  type VoidConstructionLabourCheckInResponseModel,
} from "../../check-in-models";
import {
  checkInHandlers as handlers,
  toDayResponse,
  toEntryResponse,
  toPersonResponse,
} from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Voids a check-in entry with a reason. The entry stays in the log,
 * struck out; a Labour's day is worked out again from the entries left,
 * and cleared (its wage reversed) when Check-In made it and this was its
 * last entry. 404 for another Company's entry; needs Attendance delete on
 * the entry's Project.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionLabourCheckInParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      VoidConstructionLabourCheckInRequestModel.safeParse(await request.json()),
    );
    const signedIn = await requireCompanySession(request);
    if (isResponse(signedIn)) return signedIn;
    const entry = await handlers.find(signedIn.workspaceId, id);
    const session = await requireAccess(
      request,
      "labour.attendance",
      "delete",
      { projectId: entry.projectId },
    );
    if (isResponse(session)) return session;
    const voided = await handlers.void({
      workspaceId: session.workspaceId,
      userId: session.userId,
      id,
      reason: model.reason,
    });
    const body: VoidConstructionLabourCheckInResponseModel = {
      entry: toEntryResponse(voided.entry),
      person: toPersonResponse(voided.person),
      day: toDayResponse(voided.day),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
