import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { roleHandlers as handlers } from "../../handlers";
import {
  ConstructionOrganizationRoleParamsModel,
  toRoleResponse,
} from "../../role-models";

export const dynamic = "force-dynamic";

/** Copies a Role as "<name> (copy)", with nobody on it (ADR CM-0030). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.roles",
      "create",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationRoleParamsModel.safeParse(await context.params),
    );
    const copy = await handlers.duplicate({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      grantor: session.access,
    });
    return Response.json(toRoleResponse(copy), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
