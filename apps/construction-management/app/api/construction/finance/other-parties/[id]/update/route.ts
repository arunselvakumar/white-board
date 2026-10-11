import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  OTHER_PARTY_MENU,
  otherPartyHandlers as handlers,
} from "../../handlers";
import {
  ConstructionFinanceOtherPartyParamsModel,
  toOtherPartyResponse,
  UpdateConstructionFinanceOtherPartyRequestModel,
} from "../../other-party-models";

export const dynamic = "force-dynamic";

/**
 * Saves the whole Other Party form (CM-704) when it is still as loaded
 * (409 OTHER_PARTY_CHANGED); 409 OTHER_PARTY_NAME_TAKEN for a name in use.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceOtherPartyParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdateConstructionFinanceOtherPartyRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(request, OTHER_PARTY_MENU, "update");
    if (isResponse(session)) return session;
    const { expectedUpdatedAt, ...input } = model;
    const party = await handlers.update(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
    return Response.json(toOtherPartyResponse(party));
  } catch (error) {
    return mapError(error);
  }
}
