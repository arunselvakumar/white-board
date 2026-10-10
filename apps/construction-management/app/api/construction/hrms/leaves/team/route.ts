import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  ListConstructionHrmsTeamLeavesRequestModel,
  toLeaveRequestResponse,
  type ListConstructionHrmsLeaveRequestsResponseModel,
} from "../leave-models";

export const dynamic = "force-dynamic";

/** Team Leaves (CM-313): pending, approved and cancellation-requested leave with a day in the range (View All). */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ListConstructionHrmsTeamLeavesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "view_all",
    });
    if (isResponse(session)) return session;
    const page = await leaveHandlers.requests.team(session.access, query);
    const body: ListConstructionHrmsLeaveRequestsResponseModel = {
      items: page.items.map(toLeaveRequestResponse),
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
