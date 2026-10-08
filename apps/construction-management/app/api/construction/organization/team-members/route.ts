import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  decodeListCursor,
  encodeListCursor,
} from "@/src/shared-kernel/list-cursor";

import { CreateConstructionOrganizationTeamMemberRequestModel } from "./create-team-member-request-model";
import { teamMemberHandlers as handlers } from "./handlers";
import { ListConstructionOrganizationTeamMembersRequestModel } from "./list-team-members-request-model";
import type { ListConstructionOrganizationTeamMembersResponseModel } from "./list-team-members-response-model";
import { toTeamMemberResponse } from "./team-member-models";

export const dynamic = "force-dynamic";

/** Team Members, newest first, with search and status chips (CM-110). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.team_members",
      "read",
    );
    if (isResponse(session)) return session;
    const url = new URL(request.url);
    const model = parseOrThrow(
      ListConstructionOrganizationTeamMembersRequestModel.safeParse(
        Object.fromEntries(url.searchParams),
      ),
    );
    const page = await handlers.list({
      workspaceId: session.workspaceId,
      limit: model.limit,
      after: model.after == null ? undefined : decodeListCursor(model.after),
      before: model.before == null ? undefined : decodeListCursor(model.before),
      search: model.search,
      status: model.status,
      memberType: model.memberType,
    });
    const first = page.items[0];
    const last = page.items.at(-1);
    const backwards = model.before != null;
    const moreAfter = backwards || page.hasMore;
    const moreBefore = backwards ? page.hasMore : model.after != null;
    const body: ListConstructionOrganizationTeamMembersResponseModel = {
      items: page.items.map(toTeamMemberResponse),
      nextCursor: moreAfter && last != null ? encodeListCursor(last) : null,
      prevCursor: moreBefore && first != null ? encodeListCursor(first) : null,
      total: page.total,
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/** Add Team Member: Joining Pending with an invite (CM-110). */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "organization.team_members",
      "create",
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionOrganizationTeamMemberRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { memberType, projectIds, permissions, ...details } = model;
    const member = await handlers.invite({
      workspaceId: session.workspaceId,
      by: session.userId,
      grantor: session.access,
      memberType,
      details,
      projectIds,
      permissions,
    });
    return Response.json(toTeamMemberResponse(member), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
