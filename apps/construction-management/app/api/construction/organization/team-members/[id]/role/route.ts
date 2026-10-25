import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { teamMemberHandlers as handlers } from "../../handlers";
import {
  TeamMemberIdParamsModel,
  toTeamMemberResponse,
} from "../../team-member-models";
import { SetConstructionOrganizationTeamMemberRoleRequestModel } from "./set-role-request-model";

export const dynamic = "force-dynamic";

/** Gives a Team Member another Role (ADR CM-0030). */
export async function PUT(
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
    const { roleId } = parseOrThrow(
      SetConstructionOrganizationTeamMemberRoleRequestModel.safeParse(
        await request.json(),
      ),
    );
    const member = await handlers.setRole({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      grantor: session.access,
      roleId,
    });
    return Response.json(toTeamMemberResponse(member, session.access));
  } catch (error) {
    return mapError(error);
  }
}
