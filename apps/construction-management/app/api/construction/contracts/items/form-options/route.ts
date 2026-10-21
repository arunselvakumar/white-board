import { mapError } from "@/app/api/_lib/map-error";
import { requireAnyAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ITEMS_MENU, itemHandlers as handlers } from "../handlers";
import { toFormOptionsResponse } from "../item-models";

export const dynamic = "force-dynamic";

/**
 * The Item form's pickers (CM-1102): the Company's enabled UoMs and Labour
 * Categories and its live Equipment. Needs Item Library create or update.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAnyAccess(request, ITEMS_MENU, [
      "create",
      "update",
    ]);
    if (isResponse(session)) return session;
    return Response.json(
      toFormOptionsResponse(await handlers.formOptions(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
