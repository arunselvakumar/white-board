import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import type { GetConstructionHrmsLeaveOptionsResponseModel } from "../leave-models";

export const dynamic = "force-dynamic";

/**
 * What the leave screens may offer (CM-313): your leave permissions, the
 * active leave types, and the Team Members to pick from when you may act
 * for others. Any member of the Active Company.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request);
    if (isResponse(session)) return session;
    const body: GetConstructionHrmsLeaveOptionsResponseModel =
      await leaveHandlers.requests.options(session.access);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
