import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { roleHandlers as handlers } from "../../handlers";
import {
  ConstructionOrganizationRoleParamsModel,
  UpdateConstructionOrganizationRoleRequestModel,
  toRoleResponse,
} from "../../role-models";

export const dynamic = "force-dynamic";

/**
 * Edit Role (ADR CM-0029): everyone on it has the new access from their
 * next request. 409 `STALE_ROLE`; 403 `OWN_ROLE` and `CANNOT_GRANT`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.roles",
      "update",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationRoleParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdateConstructionOrganizationRoleRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await handlers.update({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      grantor: session.access,
      name: model.name,
      description: model.description,
      permissions: model.permissions,
      updatedAt: new Date(model.updatedAt),
    });
    return Response.json(toRoleResponse(updated));
  } catch (error) {
    return mapError(error);
  }
}
