import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireOwnerSession,
} from "@/app/api/_lib/require-session";

import { teamMemberHandlers as handlers } from "../../handlers";
import { TeamMemberIdParamsModel } from "../../team-member-models";

export const dynamic = "force-dynamic";

/**
 * The full Aadhaar and PAN of a Team Member, Owner only and logged
 * (CM-108). An OTP check before revealing arrives with M9.
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
