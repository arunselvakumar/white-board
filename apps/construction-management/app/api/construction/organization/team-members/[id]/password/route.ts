import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { teamMemberHandlers as handlers } from "../../handlers";
import {
  TeamMemberIdParamsModel,
  toTeamMemberWithPasswordResponse,
} from "../../team-member-models";
import { SetConstructionOrganizationTeamMemberPasswordRequestModel } from "./set-password-request-model";

export const dynamic = "force-dynamic";

/**
 * Set a new password (ADR CM-0029 §7): makes the sign-in account for a
 * member without a User, or replaces the password of a User no other
 * Company relies on. They change it at their next sign-in.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.team_members",
      "update",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeamMemberIdParamsModel.safeParse(await context.params),
    );
    const { password } = parseOrThrow(
      SetConstructionOrganizationTeamMemberPasswordRequestModel.safeParse(
        await request.json(),
      ),
    );
    const member = await handlers.setPassword({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      password,
    });
    return Response.json(toTeamMemberWithPasswordResponse(member));
  } catch (error) {
    return mapError(error);
  }
}
