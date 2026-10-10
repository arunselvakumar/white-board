import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  ListConstructionHrmsLeaveApprovalsRequestModel,
  toLeaveRequestResponse,
  type ListConstructionHrmsLeaveApprovalsResponseModel,
} from "../leave-models";

export const dynamic = "force-dynamic";

/**
 * Leave Approvals (CM-313): one tab of Pending / Approved / Rejected /
 * Cancel Requests, with each tab's count. Needs approve or reject on
 * `hrms.leaves`.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ListConstructionHrmsLeaveApprovalsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await leaveAccess(request);
    if (isResponse(session)) return session;
    const page = await leaveHandlers.requests.approvals(session.access, query);
    const body: ListConstructionHrmsLeaveApprovalsResponseModel = {
      items: page.items.map(toLeaveRequestResponse),
      total: page.total,
      counts: page.counts,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
