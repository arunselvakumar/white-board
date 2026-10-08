import { joinerOf } from "@/app/api/_lib/joiner";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { createJoinRequestHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";

import { JoinRequestIdParamsModel } from "../../join-request-models";

export const dynamic = "force-dynamic";

const handlers = createJoinRequestHandlers();

/** Declines a Join Request (CM-109). The Owner can send a new link later. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireUserSession(request);
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      JoinRequestIdParamsModel.safeParse(await context.params),
    );
    await handlers.reject(joinerOf(session), id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return mapError(error);
  }
}
