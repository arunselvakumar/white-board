import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { leaveAccess, leaveHandlers } from "../leave-route";
import {
  CreateConstructionHrmsLeaveStructureRequestModel,
  toLeaveStructureResponse,
  type ListConstructionHrmsLeaveStructuresResponseModel,
} from "./leave-structure-models";

export const dynamic = "force-dynamic";

/** The Company's leave structures with their lines (CM-311). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "read",
    });
    if (isResponse(session)) return session;
    const items = await leaveHandlers.configuration.listStructures(
      session.access,
    );
    const body: ListConstructionHrmsLeaveStructuresResponseModel = {
      items: items.map(toLeaveStructureResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a leave structure: a name and leave types with entitlements (CM-311). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await leaveAccess(request, {
      menu: "hrms.leave_structures",
      flag: "create",
    });
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionHrmsLeaveStructureRequestModel.safeParse(
        await request.json(),
      ),
    );
    const structure = await leaveHandlers.configuration.createStructure(
      session.access,
      model,
    );
    return Response.json(toLeaveStructureResponse(structure), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
