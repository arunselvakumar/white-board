import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  requireAccess,
  requireAnyMenuRead,
} from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { roleHandlers as handlers } from "./handlers";
import {
  CreateConstructionOrganizationRoleRequestModel,
  toRoleResponse,
  type ListConstructionOrganizationRolesResponseModel,
} from "./role-models";

export const dynamic = "force-dynamic";

/**
 * Every live Role of the Active Company, by name (ADR CM-0029). Role
 * Management reads it, and so does Add User to offer the Roles.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAnyMenuRead(request, [
      "organization.roles",
      "organization.team_members",
    ]);
    if (isResponse(session)) return session;
    const items = await handlers.list(session.workspaceId);
    const body: ListConstructionOrganizationRolesResponseModel = {
      items: items.map(toRoleResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Add Role (ADR CM-0029): only with cells the caller holds themselves. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.roles",
      "create",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionOrganizationRoleRequestModel.safeParse(
        await request.json(),
      ),
    );
    const created = await handlers.create({
      workspaceId: session.workspaceId,
      by: session.userId,
      grantor: session.access,
      name: model.name,
      description: model.description,
      permissions: model.permissions,
    });
    return Response.json(toRoleResponse(created), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
