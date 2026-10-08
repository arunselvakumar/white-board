import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { assertKnownProjects } from "@/src/organization/application/project-directory";

import {
  teamMemberHandlers as handlers,
  projectDirectory,
} from "../../handlers";
import {
  TeamMemberIdParamsModel,
  toTeamMemberResponse,
} from "../../team-member-models";
import { AssignConstructionOrganizationTeamMemberProjectsRequestModel } from "./assign-projects-request-model";

export const dynamic = "force-dynamic";

/**
 * Replaces the Projects a Team Member works on (CM-110); 400
 * `PROJECT_NOT_FOUND` for an id that is not a live Project (CM-204).
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
    const { projectIds } = parseOrThrow(
      AssignConstructionOrganizationTeamMemberProjectsRequestModel.safeParse(
        await request.json(),
      ),
    );
    await assertKnownProjects(
      projectDirectory,
      session.workspaceId,
      projectIds,
    );
    const member = await handlers.assignProjects({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      projectIds,
    });
    return Response.json(toTeamMemberResponse(member));
  } catch (error) {
    return mapError(error);
  }
}
