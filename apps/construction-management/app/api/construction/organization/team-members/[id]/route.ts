import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { teamMemberHandlers as handlers } from "../handlers";
import {
  TeamMemberIdParamsModel,
  toTeamMemberResponse,
} from "../team-member-models";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.team_members",
      "read",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      TeamMemberIdParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toTeamMemberResponse(await handlers.get(session.workspaceId, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
