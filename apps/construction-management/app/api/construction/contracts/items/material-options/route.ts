import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAnyAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ITEMS_MENU, itemHandlers as handlers } from "../handlers";
import {
  ListConstructionContractsItemMaterialOptionsRequestModel,
  toMaterialOptionResponse,
  type ListConstructionContractsItemMaterialOptionsResponseModel,
} from "../item-models";

export const dynamic = "force-dynamic";

/**
 * Materials for a rate analysis line, by name (CM-1102): enabled ones, with
 * the unit rate the line suggests when the caller holds the Materials
 * menu's Financial flag. Needs Item Library create or update.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAnyAccess(request, ITEMS_MENU, [
      "create",
      "update",
    ]);
    if (isResponse(session)) return session;
    const query = parseOrThrow(
      ListConstructionContractsItemMaterialOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const body: ListConstructionContractsItemMaterialOptionsResponseModel = {
      items: (
        await handlers.materialOptions(session.access, {
          search: query.search,
          limit: query.limit,
        })
      ).map(toMaterialOptionResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
