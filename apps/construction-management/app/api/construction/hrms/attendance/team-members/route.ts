import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  toMemberResponse,
  type ListConstructionHrmsAttendanceTeamMembersResponseModel,
} from "../attendance-models";
import { attendance } from "../handlers";

export const dynamic = "force-dynamic";

/** The active Team Members the viewer can see, by name (CM-309; `view_all`). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "view_all");
    if (isResponse(session)) return session;
    const members = await attendance.teamMembers({ access: session.access });
    const body: ListConstructionHrmsAttendanceTeamMembersResponseModel = {
      items: members.map(toMemberResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
