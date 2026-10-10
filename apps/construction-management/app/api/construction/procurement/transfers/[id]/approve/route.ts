import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { materialTransfers, requireTransferSession } from "../../handlers";
import {
  ConstructionProcurementMaterialTransferParamsModel,
  ApproveConstructionProcurementMaterialTransferRequestModel,
  toTransferResponse,
} from "../../transfer-models";

export const dynamic = "force-dynamic";

/** Approve (Approve on the source): dispatches, posting Transferred out at the source on the transfer date (409 `STOCK_INSUFFICIENT` when short). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionProcurementMaterialTransferParamsModel.safeParse(
        await context.params,
      ),
    );
    const model = parseOrThrow(ApproveConstructionProcurementMaterialTransferRequestModel.safeParse(await request.json()));
    const session = await requireTransferSession(request, true);
    if (isResponse(session)) return session;
    const transfer = await materialTransfers.approve(
      session.caller,
      id,
      model.expectedUpdatedAt == null ? undefined : new Date(model.expectedUpdatedAt),
    );
    return Response.json(toTransferResponse(transfer), { status: StatusCodes.OK });
  } catch (error) {
    return mapError(error);
  }
}
