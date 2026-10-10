import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  AccrueConstructionHrmsLeaveBalancesRequestModel,
  type AccrueConstructionHrmsLeaveBalancesResponseModel,
} from "../leave-balance-models";

export const dynamic = "force-dynamic";

/**
 * "Accrue now" (CM-311): posts every monthly credit due up to today for
 * the Company's opened balances, capped at each entitlement. A period is
 * credited once, so running it again posts nothing. 409
 * `LEAVE_ACCRUAL_DISABLED` while monthly credit is off in HRMS Settings.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "update",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      AccrueConstructionHrmsLeaveBalancesRequestModel.safeParse(
        await request.json(),
      ),
    );
    const body: AccrueConstructionHrmsLeaveBalancesResponseModel =
      await leaveHandlers.balances.accrue(session.access, model);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
