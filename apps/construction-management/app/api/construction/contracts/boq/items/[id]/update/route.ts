import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  BOQ_MENU,
  boqHandlers,
  requireBoqRecordAccess,
} from "../../../boq-access";
import {
  ConstructionContractsBoqParamsModel,
  toBoqItemResponse,
  UpdateConstructionContractsBoqItemRequestModel,
} from "../../../boq-models";

export const dynamic = "force-dynamic";

/**
 * Saves the BOQ item form (CM-1103) when it is still as loaded (409
 * BOQ_ITEM_CHANGED). Once a checked measurement names the item, a new
 * quantity or rate is refused (409 BOQ_ITEM_MEASURED); the item no,
 * description, Wing or Location and section stay editable. Needs BOQ
 * update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsBoqParamsModel.safeParse(await context.params),
    );
    const session = await requireBoqRecordAccess(request, "update", (ws) =>
      boqHandlers.findItem(ws, id),
    );
    if (isResponse(session)) return session;
    const {
      expectedUpdatedAt,
      libraryItemId: _ignored,
      ...input
    } = parseOrThrow(
      UpdateConstructionContractsBoqItemRequestModel.safeParse(
        await request.json(),
      ),
    );
    const item = await boqHandlers.updateItem(
      session.access,
      id,
      new Date(expectedUpdatedAt),
      input,
    );
    return Response.json(
      toBoqItemResponse(
        item,
        can(session.access, BOQ_MENU, "financial", {
          projectId: item.projectId,
        }),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
