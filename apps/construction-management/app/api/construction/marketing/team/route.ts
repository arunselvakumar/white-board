import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { teamHandlers } from "@/src/composition/marketing-team-page";
import { TEAM_MENU } from "@/src/marketing/application/team-handlers";

import { toTeamResponse } from "./team-models";

export const dynamic = "force-dynamic";

/**
 * Every Marketing Person with this month's completed Visits against
 * target, Follow-ups overdue and their last Visit (ADR CM-0040 §4). Needs
 * Team read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, TEAM_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toTeamResponse(await teamHandlers.team(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
