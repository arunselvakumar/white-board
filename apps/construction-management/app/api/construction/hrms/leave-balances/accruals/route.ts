import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  GetConstructionHrmsLeaveBalancesRequestModel,
  toCreditEntry,
  type ListConstructionHrmsLeaveCreditsResponseModel,
} from "../leave-balance-models";

export const dynamic = "force-dynamic";

/**
 * Credit history (CM-311): the initial, monthly, carry-forward and
 * adjustment entries of a member's leave year, newest first.
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
    const history = await leaveHandlers.balances.creditHistory(
      session.access,
      query,
    );
    const body: ListConstructionHrmsLeaveCreditsResponseModel = {
      memberId: history.memberId,
      leaveYear: history.leaveYear,
      items: history.items.map(toCreditEntry),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
