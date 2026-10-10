import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import type { GetConstructionHrmsLeaveOptionsResponseModel } from "../leave-models";

export const dynamic = "force-dynamic";

/** What Apply Leave offers: active leave types and, for managers, the Team Members (CM-313). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "read",
    });
    if (isResponse(session)) return session;
    const body: GetConstructionHrmsLeaveOptionsResponseModel =
      await leaveHandlers.requests.options(session.access);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
