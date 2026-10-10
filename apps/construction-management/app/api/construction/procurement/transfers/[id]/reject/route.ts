import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { materialTransfers, requireTransferSession } from "../../handlers";
import {
  ConstructionProcurementMaterialTransferParamsModel,
  RejectConstructionProcurementMaterialTransferRequestModel,
  toTransferResponse,
} from "../../transfer-models";

export const dynamic = "force-dynamic";

/** Reject a pending transfer with a reason (Reject on the source); nothing moves. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireTransferSession(request, true);
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProcurementMaterialTransferParamsModel.safeParse(
        await context.params,
      ),
    );
    const model = parseOrThrow(
      RejectConstructionProcurementMaterialTransferRequestModel.safeParse(
        await request.json(),
      ),
    );
    const transfer = await materialTransfers.reject(
      session.caller,
      id,
      model.reason,
    );
    return Response.json(toTransferResponse(transfer), {
      status: StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
