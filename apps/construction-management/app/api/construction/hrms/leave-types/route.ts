import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../leave-route";
import {
  CreateConstructionHrmsLeaveTypeRequestModel,
  toLeaveTypeResponse,
  type ListConstructionHrmsLeaveTypesResponseModel,
} from "./leave-type-models";

export const dynamic = "force-dynamic";

/** The Company's leave types, inactive ones included, by name (CM-310). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "read",
    });
    if (isResponse(session)) return session;
    const items = await leaveHandlers.configuration.listTypes(session.access);
    const body: ListConstructionHrmsLeaveTypesResponseModel = {
      items: items.map(toLeaveTypeResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a leave type (CM-310), audited. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "create",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionHrmsLeaveTypeRequestModel.safeParse(
        await request.json(),
      ),
    );
    const type = await leaveHandlers.configuration.createType(
      session.access,
      model,
    );
    return Response.json(toLeaveTypeResponse(type), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
