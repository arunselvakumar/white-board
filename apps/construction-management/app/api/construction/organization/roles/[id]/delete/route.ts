import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { roleHandlers as handlers } from "../../handlers";
import { ConstructionOrganizationRoleParamsModel } from "../../role-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a Role (ADR CM-0030). 409 `ROLE_IN_USE` with `{ userCount }`
 * while Team Members are on it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.roles",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationRoleParamsModel.safeParse(await context.params),
    );
    await handlers.delete({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
