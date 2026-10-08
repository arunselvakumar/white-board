import { companies } from "@repo/auth/construction/server";

import { jsonWithCookies } from "@/app/api/_lib/forward-cookies";
import { joinerOf } from "@/app/api/_lib/joiner";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse, requireUserSession } from "@/app/api/_lib/require-session";
import { createJoinRequestHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";

import {
  JoinRequestIdParamsModel,
  type AcceptConstructionOrganizationJoinRequestResponseModel,
} from "../../join-request-models";

export const dynamic = "force-dynamic";

const handlers = createJoinRequestHandlers();

/** Accepts a Join Request and makes that Company active (CM-109). */
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
    const { companyId } = await handlers.accept(joinerOf(session), id);
    const cookies = await companies.activate(request.headers, companyId);
    const body: AcceptConstructionOrganizationJoinRequestResponseModel = {
      companyId,
    };
    return jsonWithCookies(body, { cookies });
  } catch (error) {
    return mapError(error);
  }
}
