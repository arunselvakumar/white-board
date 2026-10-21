import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { can } from "@/src/shared-kernel/access";

import {
  BOQ_MENU,
  boqHandlers,
  requireBoqRecordAccess,
} from "../../boq-access";
import {
  ConstructionContractsBoqParamsModel,
  toBoqItemResponse,
  toVariationResponse,
  type GetConstructionContractsBoqItemResponseModel,
} from "../../boq-models";
import { variationHandlers } from "../../boq-access";

export const dynamic = "force-dynamic";

/**
 * One BOQ item with its original and current figures and every Variation
 * naming it, newest first (CM-1103). Needs BOQ read.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsBoqParamsModel.safeParse(await context.params),
    );
    const session = await requireBoqRecordAccess(request, "read", (ws) =>
      boqHandlers.findItem(ws, id),
    );
    if (isResponse(session)) return session;
    const financial = can(session.access, BOQ_MENU, "financial", {
      projectId: session.target.projectId,
    });
    const found = await boqHandlers.item(session.access, id);
    const variations = await variationHandlers.views(
      session.workspaceId,
      found.variations,
    );
    const body: GetConstructionContractsBoqItemResponseModel = {
      item: toBoqItemResponse(found.item, financial),
      variations: variations.map((variation) =>
        toVariationResponse(variation, financial),
      ),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
