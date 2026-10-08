import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createMyProfileHandlers } from "@/src/organization/infrastructure/create-my-profile-handlers";

import { myProfileBody } from "./my-profile-body";

export const dynamic = "force-dynamic";

const handlers = createMyProfileHandlers();

/** My Profile: any Team Member, their own record only. */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    return Response.json(
      myProfileBody(await handlers.get(session.workspaceId, session.userId)),
    );
  } catch (error) {
    return mapError(error);
  }
}
