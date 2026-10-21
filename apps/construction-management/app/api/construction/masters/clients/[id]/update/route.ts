import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMastersClientParamsModel,
  toClientResponse,
  UpdateConstructionMastersClientRequestModel,
} from "../../client-models";
import { CLIENTS_MENU, clientHandlers as handlers } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Saves the whole Client form (CM-1101) when it is still as loaded (409
 * CLIENT_CHANGED); 409 CLIENT_NAME_TAKEN for a name in use. A renamed
 * Client's linked Projects take the new name on their next save.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, CLIENTS_MENU, "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMastersClientParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdateConstructionMastersClientRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { expectedUpdatedAt, ...input } = model;
    const client = await handlers.update(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
    return Response.json(toClientResponse(client));
  } catch (error) {
    return mapError(error);
  }
}
