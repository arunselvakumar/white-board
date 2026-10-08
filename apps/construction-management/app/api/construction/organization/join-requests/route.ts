import { joinerOf } from "@/app/api/_lib/joiner";
import { mapError } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { createJoinRequestHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";

import type { ListConstructionOrganizationJoinRequestsResponseModel } from "./join-request-models";

export const dynamic = "force-dynamic";

const handlers = createJoinRequestHandlers();

/** Join Requests for the signed-in User's verified mobile or email (CM-109). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const items = await handlers.listFor(joinerOf(session));
    const body: ListConstructionOrganizationJoinRequestsResponseModel = {
      items: items.map((item) => ({
        ...item,
        invitedAt: item.invitedAt?.toISOString() ?? null,
      })),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
