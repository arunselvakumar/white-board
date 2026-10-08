import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { teamMemberHandlers as handlers } from "../../handlers";
import {
  TeamMemberIdParamsModel,
  toTeamMemberResponse,
} from "../../team-member-models";

export const dynamic = "force-dynamic";

/** A new invite link, sent again; also reopens a declined request (CM-110). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.team_members",
      "create",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeamMemberIdParamsModel.safeParse(await context.params),
    );
    const member = await handlers.resendInvite({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
    });
    return Response.json(toTeamMemberResponse(member));
  } catch (error) {
    return mapError(error);
  }
}
