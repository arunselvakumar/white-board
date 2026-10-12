import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  finance,
  requestPlace,
  requirePlaceAccess,
} from "../../parties/handlers";
import {
  ListConstructionFinanceAwaitingGoodsReceiptsRequestModel,
  toAwaitingGoodsReceiptResponse,
  type ListConstructionFinanceAwaitingGoodsReceiptsResponse,
} from "../invoice-models";

export const dynamic = "force-dynamic";

/**
 * GRNs on a Project (or Store) without a supplier invoice, oldest first
 * ("awaiting invoice", CM-0017 §13). Needs Parties read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const place = requestPlace(query, "supplier");
    const session = await requirePlaceAccess(request, "read", place);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionFinanceAwaitingGoodsReceiptsRequestModel.safeParse(query),
    );
    const items = await finance.invoices.awaitingGoodsReceipts(
      session.workspaceId,
      place,
      model.supplierId ?? null,
    );
    const body: ListConstructionFinanceAwaitingGoodsReceiptsResponse = {
      items: items.map(toAwaitingGoodsReceiptResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
