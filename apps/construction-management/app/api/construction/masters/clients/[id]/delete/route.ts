import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionMastersClientParamsModel,
  DeleteConstructionMastersClientRequestModel,
} from "../../client-models";
import { CLIENTS_MENU, clientHandlers as handlers } from "../../handlers";

export const dynamic = "force-dynamic";

/**
 * Deletes a Client (CM-1101): refused with 409 CLIENT_IN_USE (and
 * `details.projectCount`) while a live Project links it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, CLIENTS_MENU, "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMastersClientParamsModel.safeParse(await context.params),
    );
    const text = await request.text();
    const model = parseOrThrow(
      DeleteConstructionMastersClientRequestModel.safeParse(
        text.trim() === "" ? {} : JSON.parse(text),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      model.expectedUpdatedAt == null
        ? null
        : new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
