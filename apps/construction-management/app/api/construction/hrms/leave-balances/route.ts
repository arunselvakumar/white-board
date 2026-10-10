import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../leave-route";
import {
  GetConstructionHrmsLeaveBalancesRequestModel,
  toMemberBalances,
} from "./leave-balance-models";

export const dynamic = "force-dynamic";

/**
 * A member's leave balances for a leave year, per leave type, from the
 * ledger (CM-311): your own with `hrms.leaves` read, anyone's with View All.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      GetConstructionHrmsLeaveBalancesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "read",
    });
    if (isResponse(session)) return session;
    return Response.json(
      toMemberBalances(
        await leaveHandlers.balances.memberBalances(session.access, query),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
