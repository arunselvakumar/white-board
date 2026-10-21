import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMastersClientParamsModel,
  toClientResponse,
} from "../client-models";
import { CLIENTS_MENU, clientHandlers as handlers } from "../handlers";

export const dynamic = "force-dynamic";

/** One live Client (CM-1101); 404 for another Company's. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionMastersClientParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, CLIENTS_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toClientResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
