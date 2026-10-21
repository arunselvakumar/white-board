import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ITEMS_MENU, itemHandlers as handlers } from "../handlers";
import {
  ConstructionContractsItemParamsModel,
  toItemResponse,
} from "../item-models";

export const dynamic = "force-dynamic";

/**
 * One live Item with its rate analysis lines and the names of their
 * Materials, Labour Categories, Equipment and UoMs (CM-1102); 404 for
 * another Company's.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsItemParamsModel.safeParse(await context.params),
    );
    const session = await requireAccess(request, ITEMS_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toItemResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
