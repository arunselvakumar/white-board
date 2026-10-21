import { prisma } from "@repo/construction-db";
import { StatusCodes } from "http-status-codes";

import { jsonError } from "@/app/api/_lib/json-error";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import {
  isResponse,
  requireCompanySession,
} from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";
import { loadMemberAccess } from "@/src/shared-kernel/access/prisma-access-reader";
import { isUuid } from "@/src/shared-kernel/ids";

import {
  ListConstructionMastersClientOptionsRequestModel,
  toClientOptionResponse,
  type ListConstructionMastersClientOptionsResponseModel,
} from "../client-models";
import { CLIENTS_MENU, clientHandlers as handlers } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * The Project form's Client picker (CM-1101): active Clients by name
 * (`ids` also returns an inactive one a Project already links). Needs
 * Clients read, or Project create or update.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireCompanySession(request);
    if (isResponse(session)) return session;
    const access = await loadMemberAccess(prisma, session);
    if (
      !can(access, CLIENTS_MENU, "read") &&
      !can(access, "projects.project", "create") &&
      !can(access, "projects.project", "update")
    )
      return jsonError(
        StatusCodes.FORBIDDEN,
        "PERMISSION_DENIED",
        "You do not have permission to do this. Ask the Owner to change your Permission Matrix.",
      );
    const query = parseOrThrow(
      ListConstructionMastersClientOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const ids = query.ids
      ?.split(",")
      .map((id) => id.trim())
      .filter(isUuid);
    const items = await handlers.options({
      workspaceId: session.workspaceId,
      search: query.search,
      ids,
      limit: query.limit,
    });
    const body: ListConstructionMastersClientOptionsResponseModel = {
      items: items.map(toClientOptionResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
