import { mapError } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { createMyProfileHandlers } from "@/src/organization/infrastructure/create-my-profile-handlers";
import { assertRevealAllowed } from "@/src/shared-kernel/action-codes";

import type { RevealConstructionOrganizationMyIdentifiersResponseModel } from "./reveal-my-identifiers-response-model";

export const dynamic = "force-dynamic";

const handlers = createMyProfileHandlers();

/**
 * The caller's own Aadhaar and PAN in full. A member may always reveal
 * their own, after verifying a `reveal_identifiers` code in this session
 * (409 `REVEAL_CODE_REQUIRED`, ADR CM-0021 §11); each reveal is audited.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    await assertRevealAllowed(session);
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
