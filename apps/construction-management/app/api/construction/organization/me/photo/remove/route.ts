import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createMyProfileHandlers } from "@/src/organization/infrastructure/create-my-profile-handlers";

import { myProfileBody } from "../../profile/my-profile-body";

export const dynamic = "force-dynamic";

const handlers = createMyProfileHandlers();

/** Removes the caller's photo; fine when there is none. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const profile = await handlers.removePhoto({
      workspaceId: session.workspaceId,
      userId: session.userId,
    });
    return Response.json(myProfileBody(profile));
  } catch (error) {
    return mapError(error);
  }
}
