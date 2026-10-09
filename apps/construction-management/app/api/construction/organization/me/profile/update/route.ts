import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createMyProfileHandlers } from "@/src/organization/infrastructure/create-my-profile-handlers";

import { myProfileBody } from "../my-profile-body";
import { UpdateConstructionOrganizationMyProfileRequestModel } from "./update-my-profile-request-model";

export const dynamic = "force-dynamic";

const handlers = createMyProfileHandlers();

/**
 * Changes the caller's own name, email, address, emergency contact and ids,
 * and their mobile while SMS is off (ADR CM-0009).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const changes = parseOrThrow(
      UpdateConstructionOrganizationMyProfileRequestModel.safeParse(
        await request.json(),
      ),
    );
    const profile = await handlers.update({
      workspaceId: session.workspaceId,
      userId: session.userId,
      changes,
    });
    return Response.json(myProfileBody(profile));
  } catch (error) {
    return mapError(error);
  }
}
