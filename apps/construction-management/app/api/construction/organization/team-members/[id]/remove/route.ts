import { companies } from "@repo/auth/construction/server";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { forbidden } from "@/src/shared-kernel/domain-error";

import { teamMemberHandlers as handlers } from "../../handlers";
import { TeamMemberIdParamsModel } from "../../team-member-models";

export const dynamic = "force-dynamic";

/**
 * Removes a Team Member (CM-110): tombstones the record (their name stays on
 * old entries) and ends their membership, so access stops on their next
 * request. A pending invitation is simply cancelled.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.team_members",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeamMemberIdParamsModel.safeParse(await context.params),
    );
    const target = await handlers.get(session.workspaceId, id);
    if (target.userId === session.userId)
      throw forbidden("CANNOT_REMOVE_YOURSELF", "You cannot remove yourself.");
    const { userId } = await handlers.remove({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
    });
    if (userId != null)
      await companies.removeMember({
        workspaceId: session.workspaceId,
        userId,
      });
    return new Response(null, { status: 204 });
  } catch (error) {
    return mapError(error);
  }
}
