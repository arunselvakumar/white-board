import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { teamHandlers } from "@/src/composition/marketing-team-page";
import { TEAM_MENU } from "@/src/marketing/application/team-handlers";

import {
  ConstructionMarketingTeamMemberParamsModel,
  SetConstructionMarketingVisitTargetRequestModel,
  toTeamResponse,
} from "../../team-models";

export const dynamic = "force-dynamic";

/**
 * Sets a Marketing Person's monthly Visit target from this month on;
 * earlier months keep theirs. Answers the Team. Needs Team read and
 * update; the handler checks both before saving.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ memberId: string }> },
): Promise<Response> {
  try {
    const { memberId } = parseOrThrow(
      ConstructionMarketingTeamMemberParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireAccess(request, TEAM_MENU, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      SetConstructionMarketingVisitTargetRequestModel.safeParse(
        await request.json(),
      ),
    );
    await teamHandlers.setTarget(session.access, memberId, model.target);
    return Response.json(
      toTeamResponse(await teamHandlers.team(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
