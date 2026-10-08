import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { createJoinRequestHandlers } from "@/src/organization/infrastructure/create-team-member-handlers";

import {
  JoinLinkTokenParamsModel,
  type GetConstructionOrganizationJoinLinkResponseModel,
} from "./join-link-models";

export const dynamic = "force-dynamic";

const handlers = createJoinRequestHandlers();

/**
 * What an invite link shows before sign-in (CM-109): the Company and who the
 * request is for, masked. No Session needed; the token is the secret.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
): Promise<Response> {
  try {
    const { token } = parseOrThrow(
      JoinLinkTokenParamsModel.safeParse(await context.params),
    );
    const body: GetConstructionOrganizationJoinLinkResponseModel =
      await handlers.preview(token);
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mapError(error);
  }
}
