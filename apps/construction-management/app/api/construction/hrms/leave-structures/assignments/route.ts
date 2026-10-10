import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../../leave-route";
import {
  CreateConstructionHrmsLeaveAssignmentsRequestModel,
  ListConstructionHrmsLeaveAssignmentsRequestModel,
  toLeaveAssignmentResponse,
  type ListConstructionHrmsLeaveAssignmentsResponseModel,
} from "../leave-structure-models";

export const dynamic = "force-dynamic";

/** Live structure assignments, by member then latest date first (CM-311). */
export async function GET(request: Request): Promise<Response> {
  try {
    const filter = parseOrThrow(
      ListConstructionHrmsLeaveAssignmentsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "read",
    });
    if (isResponse(session)) return session;
    const items = await leaveHandlers.configuration.listAssignments(
      session.access,
      filter,
    );
    const body: ListConstructionHrmsLeaveAssignmentsResponseModel = {
      items: items.map(toLeaveAssignmentResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Assigns a structure to Team Members from a date (CM-311). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "create",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionHrmsLeaveAssignmentsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const items = await leaveHandlers.configuration.assign(
      session.access,
      model,
    );
    const body: ListConstructionHrmsLeaveAssignmentsResponseModel = {
      items: items.map(toLeaveAssignmentResponse),
    };
    return Response.json(body, { status: StatusCodes.CREATED });
  } catch (error) {
    return mapError(error);
  }
}
