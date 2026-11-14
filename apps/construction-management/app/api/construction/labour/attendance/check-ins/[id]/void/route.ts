import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";

import { can } from "@/src/shared-kernel/access";
import { forbidden } from "@/src/shared-kernel/domain-error";

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
 *
 * A Labour's entry changes their attendance day, so its void is an edit of
 * that day: it also needs Attendance update, and passes the Back-dated
 * Entry check (`labour_attendance`) for the entry's attendance day, as an
 * edit on the marking sheet does (ADR CM-0043 §8). A Vendor's and a Site
 * Engineer's entries change no day and need delete alone.
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
    if (
      entry.kind === "labour" &&
      !can(session.access, "labour.attendance", "update", {
        projectId: entry.projectId,
      })
    )
      throw forbidden(
        "PERMISSION_DENIED",
        "Voiding a Labour's entry changes their attendance day, so it needs permission to change marked attendance.",
      );
    const voided = await handlers.void({
      workspaceId: session.workspaceId,
      userId: session.userId,
      role: session.role,
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
