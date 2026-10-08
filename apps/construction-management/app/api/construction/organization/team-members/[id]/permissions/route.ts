import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { teamMemberHandlers as handlers } from "../../handlers";
import {
  TeamMemberIdParamsModel,
  toTeamMemberResponse,
} from "../../team-member-models";
import { SetConstructionOrganizationTeamMemberPermissionsRequestModel } from "./set-permissions-request-model";

export const dynamic = "force-dynamic";

/** Replaces a Team Member's Permission Matrix (CM-110, ADR CM-0003). */
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
    const { permissions } = parseOrThrow(
      SetConstructionOrganizationTeamMemberPermissionsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const member = await handlers.setPermissions({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      grantor: session.access,
      permissions,
    });
    return Response.json(toTeamMemberResponse(member));
  } catch (error) {
    return mapError(error);
  }
}
