import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";
import { assertRevealAllowed } from "@/src/shared-kernel/action-codes";

import { teamMemberHandlers as handlers } from "../../handlers";
import { TeamMemberIdParamsModel } from "../../team-member-models";

export const dynamic = "force-dynamic";

/**
 * The full Aadhaar and PAN of a Team Member, Owner only and logged
 * (CM-108). Needs a `reveal_identifiers` code verified in this session in
 * the last 10 minutes (409 `REVEAL_CODE_REQUIRED`, ADR CM-0021 §11).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireOwnerSession(request);
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeamMemberIdParamsModel.safeParse(await context.params),
    );
    await assertRevealAllowed(session);
    const revealed = await handlers.revealIdentifiers({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
    });
    return Response.json(revealed, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return mapError(error);
  }
}
