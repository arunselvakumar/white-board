import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { priceIndexHandlers } from "@/src/composition/contracts-escalation";
import { PRICE_INDEX_MENU } from "@/src/contracts/application/escalation-ports";

import { ConstructionContractsPriceIndexParamsModel } from "../../price-index-models";

export const dynamic = "force-dynamic";

/**
 * Removes a month (CM-1109). Approved escalation bills keep their working;
 * a draft needing the month is refused when next worked out (400
 * PRICE_INDEX_MISSING). Needs the Item Library's Delete.
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
    const session = await requireAccess(request, PRICE_INDEX_MENU, "delete");
    if (isResponse(session)) return session;
    await priceIndexHandlers.delete(session.access, id);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
