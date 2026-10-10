import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import type { GetConstructionHrmsLeaveAccrualOptionsResponseModel } from "../leave-type-models";

export const dynamic = "force-dynamic";

/** The accrual modes and frequencies a leave type can use (CM-310, ADR CM-0012 §7). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "read",
    });
    if (isResponse(session)) return session;
    const body: GetConstructionHrmsLeaveAccrualOptionsResponseModel =
      leaveHandlers.configuration.accrualOptions(session.access);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
