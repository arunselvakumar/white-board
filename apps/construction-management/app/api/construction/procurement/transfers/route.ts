import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { decodeListCursor } from "@/src/shared-kernel/list-cursor";

import { materialTransfers, requireTransferSession } from "./handlers";
import {
  CreateConstructionProcurementMaterialTransferRequestModel,
  ListConstructionProcurementMaterialTransfersRequestModel,
  toTransferListResponse,
  toTransferResponse,
} from "./transfer-models";

export const dynamic = "force-dynamic";

/**
 * Material Transfers into and out of a Project or Store, newest first, by
 * direction, status and transfer date (Material Transfer Read on that
 * side; a Store also needs Central store Read).
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const query = parseOrThrow(
      ListConstructionProcurementMaterialTransfersRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireTransferSession(request, false);
    if (isResponse(session)) return session;
    const page = await materialTransfers.list(session.caller, {
      location: { kind: query.locationKind, id: query.locationId },
      direction: query.direction,
      status: query.status,
      from: query.from,
      to: query.to,
      limit: query.limit,
      after: query.after == null ? undefined : decodeListCursor(query.after),
      before: query.before == null ? undefined : decodeListCursor(query.before),
    });
    return Response.json(
      toTransferListResponse(page, {
        after: query.after,
        before: query.before,
      }),
    );
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Raise a Material Transfer (Create on the source): numbered, pending, or
 * approved and dispatched at once with `approve` (Save & Approve, 409
 * `STOCK_INSUFFICIENT` when the source is short).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionProcurementMaterialTransferRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireTransferSession(request, true);
    if (isResponse(session)) return session;
    const transfer = await materialTransfers.create(session.caller, model);
    return Response.json(toTransferResponse(transfer), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
