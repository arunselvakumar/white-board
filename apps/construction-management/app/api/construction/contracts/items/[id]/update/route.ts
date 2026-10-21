import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ITEMS_MENU, itemHandlers as handlers } from "../../handlers";
import {
  ConstructionContractsItemParamsModel,
  toItemResponse,
  UpdateConstructionContractsItemRequestModel,
} from "../../item-models";

export const dynamic = "force-dynamic";

/**
 * Saves the whole Item form (CM-1102) when it is still as loaded (409
 * ITEM_CHANGED): its fields, and the rate analysis lines replaced in the
 * same transaction. 409 ITEM_CODE_TAKEN for a code in use.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, ITEMS_MENU, "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionContractsItemParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdateConstructionContractsItemRequestModel.safeParse(
        await request.json(),
      ),
    );
    const { expectedUpdatedAt, ...input } = model;
    const item = await handlers.update(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
    return Response.json(toItemResponse(item));
  } catch (error) {
    return mapError(error);
  }
}
