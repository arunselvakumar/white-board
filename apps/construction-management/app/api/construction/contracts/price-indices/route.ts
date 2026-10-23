import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { priceIndexHandlers } from "@/src/composition/contracts-escalation";
import { PRICE_INDEX_MENU } from "@/src/contracts/application/escalation-ports";

import {
  CreateConstructionContractsPriceIndexRequestModel,
  toPriceIndexListResponse,
  toPriceIndexResponse,
} from "./price-index-models";

export const dynamic = "force-dynamic";

/**
 * Master records → Price indices (CM-1109, ADR CM-0023 §9): every series
 * the Company keeps with its months, and the usual series it does not
 * keep yet. Company-level, under the Item Library's menu
 * (`contracts.items`): needs its Read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PRICE_INDEX_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toPriceIndexListResponse(await priceIndexHandlers.list(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Adds one month of a series (CM-1109): 409 PRICE_INDEX_EXISTS when the
 * series already has that month. Needs the Item Library's Create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, PRICE_INDEX_MENU, "create");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      CreateConstructionContractsPriceIndexRequestModel.safeParse(
        await request.json(),
      ),
    );
    const row = await priceIndexHandlers.create(session.access, model);
    return Response.json(toPriceIndexResponse(row), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
