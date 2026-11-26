import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  ConstructionPersonAttendanceRequestModel,
  toPersonAttendanceResponse,
} from "@/app/api/_lib/person-attendance-models";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { createTeamMemberAttendanceCalendar } from "@/src/composition/team-member-attendance-calendar";
import { can } from "@/src/shared-kernel/access";

import { TeamMemberIdParamsModel } from "../../team-member-models";

export const dynamic = "force-dynamic";

const calendar = createTeamMemberAttendanceCalendar();

/**
 * An Office Staff member's Attendance tab (ADR CM-0051): a page of months
 * of HRMS days with the day status and the hours by branch or Project
 * site, all-time figures on the first page. Needs Office Staff Read and
 * HRMS Attendance Read (§5): 403 `HRMS_ATTENDANCE_READ_REQUIRED` without
 * the second. Not filtered by Project. No amounts.
 */
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
    if (!can(session.access, "hrms.attendance", "read"))
      return jsonError(
        StatusCodes.FORBIDDEN,
        "HRMS_ATTENDANCE_READ_REQUIRED",
        "You need HRMS Attendance Read to see a Team Member's attendance. Ask the Owner to change your Permission Matrix.",
      );
    const { id } = parseOrThrow(
      TeamMemberIdParamsModel.safeParse(await context.params),
    );
    const query = parseOrThrow(
      ConstructionPersonAttendanceRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const attendance = await calendar.calendar(session.access, id, {
      to: query.to ?? null,
      months: query.months,
    });
    return Response.json(toPersonAttendanceResponse(attendance));
  } catch (error) {
    return mapError(error);
  }
}
