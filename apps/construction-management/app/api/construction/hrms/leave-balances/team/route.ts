import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  GetConstructionHrmsTeamLeaveBalancesRequestModel,
  toMemberBalances,
  type GetConstructionHrmsTeamLeaveBalancesResponseModel,
} from "../leave-balance-models";

export const dynamic = "force-dynamic";

/** Every active Team Member's balances for a leave year (`hrms.leaves` View All). */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      GetConstructionHrmsTeamLeaveBalancesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "view_all",
    });
    if (isResponse(session)) return session;
    const team = await leaveHandlers.balances.teamBalances(
      session.access,
      query,
    );
    const body: GetConstructionHrmsTeamLeaveBalancesResponseModel = {
      leaveYear: team.leaveYear,
      members: team.members.map(toMemberBalances),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
