import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../leave-route";
import {
  ApplyConstructionHrmsLeaveRequestModel,
  ListConstructionHrmsMyLeavesRequestModel,
  toLeaveRequestResponse,
  type ListConstructionHrmsLeaveRequestsResponseModel,
} from "./leave-models";

export const dynamic = "force-dynamic";

/** My Leaves: the caller's own requests, newest first (CM-313). */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ListConstructionHrmsMyLeavesRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "read",
    });
    if (isResponse(session)) return session;
    const page = await leaveHandlers.requests.listMine(session.access, query);
    const body: ListConstructionHrmsLeaveRequestsResponseModel = {
      items: page.items.map(toLeaveRequestResponse),
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Apply for leave (CM-312), for yourself or, with View All, for another
 * Team Member. Pending with the days reserved, or approved at once when
 * the type needs no approval.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leaves",
      flag: "create",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ApplyConstructionHrmsLeaveRequestModel.safeParse(await request.json()),
    );
    const created = await leaveHandlers.requests.apply(session.access, model);
    return Response.json(toLeaveRequestResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
