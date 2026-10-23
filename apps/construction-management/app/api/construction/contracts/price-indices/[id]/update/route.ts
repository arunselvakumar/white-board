import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { priceIndexHandlers } from "@/src/composition/contracts-escalation";
import { PRICE_INDEX_MENU } from "@/src/contracts/application/escalation-ports";

import {
  ConstructionContractsPriceIndexParamsModel,
  toPriceIndexResponse,
  UpdateConstructionContractsPriceIndexRequestModel,
} from "../../price-index-models";

export const dynamic = "force-dynamic";

/**
 * Changes a month's value (CM-1109): 404 PRICE_INDEX_NOT_FOUND, 409
 * PRICE_INDEX_CHANGED when stale. Needs the Item Library's Update.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsPriceIndexParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireAccess(request, PRICE_INDEX_MENU, "update");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionContractsPriceIndexRequestModel.safeParse(
        await request.json(),
      ),
    );
    const row = await priceIndexHandlers.update(session.access, id, {
      value: model.value,
      expectedUpdatedAt:
        model.expectedUpdatedAt == null
          ? null
          : new Date(model.expectedUpdatedAt),
    });
    return Response.json(toPriceIndexResponse(row));
  } catch (error) {
    return mapError(error);
  }
}
