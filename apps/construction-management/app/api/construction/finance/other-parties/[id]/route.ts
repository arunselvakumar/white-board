import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { OTHER_PARTY_MENU, otherPartyHandlers as handlers } from "../handlers";
import {
  ConstructionFinanceOtherPartyParamsModel,
  toOtherPartyResponse,
} from "../other-party-models";

export const dynamic = "force-dynamic";

/** One live Other Party (CM-704); 404 for another Company's. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionFinanceOtherPartyParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, OTHER_PARTY_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toOtherPartyResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
