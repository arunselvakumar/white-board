import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { toTeamTodayResponse } from "../attendance-models";
import { attendance } from "../handlers";

export const dynamic = "force-dynamic";

/** Team Today: where each active Team Member stands now (CM-309; `view_all`). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "view_all");
    if (isResponse(session)) return session;
    const team = await attendance.teamToday({ access: session.access });
    return Response.json(toTeamTodayResponse(team));
  } catch (error) {
    return mapError(error);
  }
}
