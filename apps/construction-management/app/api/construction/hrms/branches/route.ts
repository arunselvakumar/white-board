import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  CreateConstructionHrmsBranchRequestModel,
  toBranchResponse,
  toEmployeeOption,
  type ListConstructionHrmsBranchesResponseModel,
} from "./branch-models";
import { branches } from "./handlers";

export const dynamic = "force-dynamic";

/** Office branches and Project site fences, and the Team Members that can be linked (CM-304). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.settings", "read");
    if (isResponse(session)) return session;
    const listed = await branches.list({ access: session.access });
    const body: ListConstructionHrmsBranchesResponseModel = {
      items: listed.branches.map(toBranchResponse),
      employees: listed.employees.map(toEmployeeOption),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds an office branch or a Project's site fence (CM-304). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, "hrms.settings", "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionHrmsBranchRequestModel.safeParse(await request.json()),
    );
    const created = await branches.create({
      access: session.access,
      branch: model,
    });
    return Response.json(toBranchResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
