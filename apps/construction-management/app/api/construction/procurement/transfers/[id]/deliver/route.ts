import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { materialTransfers, requireTransferSession } from "../../handlers";
import {
  ConstructionProcurementMaterialTransferParamsModel,
  DeliverConstructionProcurementMaterialTransferRequestModel,
  toTransferResponse,
} from "../../transfer-models";

export const dynamic = "force-dynamic";

/** Mark as Delivered (Update on the destination): posts Transferred in at the destination on the delivery date. */
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
    const model = parseOrThrow(DeliverConstructionProcurementMaterialTransferRequestModel.safeParse(await request.json()));
    const session = await requireTransferSession(request, true);
    if (isResponse(session)) return session;
    const transfer = await materialTransfers.deliver(session.caller, id, model.deliveredOn);
    return Response.json(toTransferResponse(transfer), { status: StatusCodes.OK });
  } catch (error) {
    return mapError(error);
  }
}
