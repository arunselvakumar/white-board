import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { toTodayResponse } from "../attendance-models";
import { attendance } from "../handlers";

export const dynamic = "force-dynamic";

/** My Attendance today: state, entries, the open entry and pending requests (CM-309). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.attendance", "read");
    if (isResponse(session)) return session;
    const view = await attendance.today({ access: session.access });
    return Response.json(toTodayResponse(view));
  } catch (error) {
    return mapError(error);
  }
}
