import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { imageResponse } from "@/app/api/_lib/uploads";

import { ConstructionLabourCheckInParamsModel } from "../../check-in-models";
import { checkInHandlers as handlers } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * The photo taken with a check-in entry, privately cached. 404
 * `PHOTO_NOT_FOUND` once retention removed it (90 days), and
 * `CHECK_IN_NOT_FOUND` for another Company's entry. Needs Attendance read
 * on the entry's Project.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionLabourCheckInParamsModel.safeParse(await context.params),
    );
    const signedIn = await requireCompanySession(request);
    if (isResponse(signedIn)) return signedIn;
    const entry = await handlers.find(signedIn.workspaceId, id);
    const session = await requireAccess(request, "labour.attendance", "read", {
      projectId: entry.projectId,
    });
    if (isResponse(session)) return session;
    return imageResponse(await handlers.photo(session.workspaceId, id));
  } catch (error) {
    return mapError(error);
  }
}
