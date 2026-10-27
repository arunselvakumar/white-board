import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { teamMemberHandlers as handlers } from "../../handlers";
import {
  TeamMemberIdParamsModel,
  salaryInput,
  toTeamMemberResponse,
} from "../../team-member-models";
import { UpdateConstructionOrganizationTeamMemberRequestModel } from "./update-team-member-request-model";

export const dynamic = "force-dynamic";

/** Edit details, salary and Member Type (CM-110, ADR CM-0032, CM-0033). */
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
    const {
      memberType,
      salaryType,
      salaryPerDay,
      salaryPerMonth,
      overtimeWagePerHour,
      workingHoursPerDay,
      weeklyHolidays,
      ...details
    } = parseOrThrow(
      UpdateConstructionOrganizationTeamMemberRequestModel.safeParse(
        await request.json(),
      ),
    );
    const member = await handlers.update({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      details,
      // Without Financial the amounts are never seen, so they are kept (ADR CM-0032).
      salary: salaryInput(
        {
          salaryType,
          salaryPerDay,
          salaryPerMonth,
          overtimeWagePerHour,
          workingHoursPerDay,
          weeklyHolidays,
        },
        session.access,
      ),
      memberType,
    });
    return Response.json(toTeamMemberResponse(member, session.access));
  } catch (error) {
    return mapError(error);
  }
}
