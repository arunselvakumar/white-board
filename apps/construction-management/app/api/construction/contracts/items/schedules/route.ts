import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ITEMS_MENU, itemHandlers as handlers } from "../handlers";
import type { ListConstructionContractsItemSchedulesResponseModel } from "../item-models";

export const dynamic = "force-dynamic";

/** The schedules live Items carry, A–Z: the list's filter (Item Library read). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, ITEMS_MENU, "read");
    if (isResponse(session)) return session;
    const body: ListConstructionContractsItemSchedulesResponseModel = {
      items: await handlers.schedules(session.access),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
