import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireAccess,
  requireAnyMenuRead,
} from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  CreateConstructionOrganizationDepartmentRequestModel,
  toDepartmentResponse,
  type ListConstructionOrganizationDepartmentsResponseModel,
} from "./department-models";
import { departmentHandlers as handlers } from "./handlers";

export const dynamic = "force-dynamic";

/**
 * Every live department of the Active Company, by name (ADR CM-0049).
 * Manage Departments reads it, and so does Add Role / Edit Role to offer
 * the Departments a Role may be under (ADR CM-0050).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAnyMenuRead(request, [
      "organization.departments",
      "organization.roles",
    ]);
    if (isResponse(session)) return session;
    const items = await handlers.list(session.workspaceId);
    const body: ListConstructionOrganizationDepartmentsResponseModel = {
      items: items.map(toDepartmentResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Adds a department. 409 `DEPARTMENT_NAME_TAKEN` (any case). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.departments",
      "create",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionOrganizationDepartmentRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await handlers.create({
      workspaceId: session.workspaceId,
      by: session.userId,
      name: model.name,
    });
    return Response.json(toDepartmentResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
