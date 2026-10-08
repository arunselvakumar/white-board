import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createMyProfileHandlers } from "@/src/organization/infrastructure/create-my-profile-handlers";

import type { RevealConstructionOrganizationMyIdentifiersResponseModel } from "./reveal-my-identifiers-response-model";

export const dynamic = "force-dynamic";

const handlers = createMyProfileHandlers();

/**
 * The caller's own Aadhaar and PAN in full. A member may always reveal
 * their own; each reveal is audited. An OTP step arrives with M9.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const body: RevealConstructionOrganizationMyIdentifiersResponseModel =
      await handlers.revealIdentifiers({
        workspaceId: session.workspaceId,
        userId: session.userId,
      });
    return Response.json(body, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return mapError(error);
  }
}
