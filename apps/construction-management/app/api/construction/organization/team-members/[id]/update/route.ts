import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { teamMemberHandlers as handlers } from "../../handlers";
import {
  TeamMemberIdParamsModel,
  toTeamMemberResponse,
} from "../../team-member-models";
import { UpdateConstructionOrganizationTeamMemberRequestModel } from "./update-team-member-request-model";

export const dynamic = "force-dynamic";

/** Edit details and Member Type (CM-110). */
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
    const { memberType, ...details } = parseOrThrow(
      UpdateConstructionOrganizationTeamMemberRequestModel.safeParse(
        await request.json(),
      ),
    );
    const member = await handlers.update({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      grantor: session.access,
      details,
      memberType,
    });
    return Response.json(toTeamMemberResponse(member));
  } catch (error) {
    return mapError(error);
  }
}
