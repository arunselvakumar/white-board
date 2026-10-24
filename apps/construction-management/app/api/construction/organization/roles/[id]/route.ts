import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAnyMenuRead } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { roleHandlers as handlers } from "../handlers";
import {
  ConstructionOrganizationRoleParamsModel,
  toRoleResponse,
} from "../role-models";

export const dynamic = "force-dynamic";

/** One Role with its matrix (ADR CM-0030); 404 `ROLE_NOT_FOUND`. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAnyMenuRead(request, [
      "organization.roles",
      "organization.team_members",
    ]);
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionOrganizationRoleParamsModel.safeParse(await context.params),
    );
    return Response.json(
      toRoleResponse(await handlers.get(session.workspaceId, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
