import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ITEMS_MENU, itemHandlers as handlers } from "../../handlers";
import {
  ConstructionContractsItemParamsModel,
  DeleteConstructionContractsItemRequestModel,
} from "../../item-models";

export const dynamic = "force-dynamic";

/**
 * Deletes an Item (CM-1102): refused with 409 ITEM_IN_USE (and
 * `details.count`) while a live BOQ item was copied from it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, ITEMS_MENU, "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionContractsItemParamsModel.safeParse(await context.params),
    );
    const text = await request.text();
    const model = parseOrThrow(
      DeleteConstructionContractsItemRequestModel.safeParse(
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
