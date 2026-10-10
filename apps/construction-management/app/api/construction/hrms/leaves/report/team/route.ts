import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../../leave-route";
import {
  ListConstructionHrmsTeamLeavesRequestModel,
  type GetConstructionHrmsTeamLeaveReportResponseModel,
} from "../../leave-models";

export const dynamic = "force-dynamic";

/** The team leave report (CM-313, `hrms.leaves` report): approved days per member by type, paid and unpaid, and pending days. */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ListConstructionHrmsTeamLeavesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "report",
    });
    if (isResponse(session)) return session;
    const body: GetConstructionHrmsTeamLeaveReportResponseModel =
      await leaveHandlers.requests.teamReport(session.access, query);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
