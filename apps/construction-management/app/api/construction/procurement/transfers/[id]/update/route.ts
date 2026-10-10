import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { materialTransfers, requireTransferSession } from "../../handlers";
import {
  ConstructionProcurementMaterialTransferParamsModel,
  UpdateConstructionProcurementMaterialTransferRequestModel,
  toTransferResponse,
} from "../../transfer-models";

export const dynamic = "force-dynamic";

/** Edit a pending transfer (Update on its source; 409 `MATERIAL_TRANSFER_NOT_PENDING`, `MATERIAL_TRANSFER_CHANGED`). */
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
    const session = await requireTransferSession(request, true);
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      UpdateConstructionProcurementMaterialTransferRequestModel.safeParse(
        await request.json(),
      ),
    );
    const transfer = await materialTransfers.update(session.caller, id, {
      ...model,
      expectedUpdatedAt: new Date(model.expectedUpdatedAt),
    });
    return Response.json(toTransferResponse(transfer), {
      status: StatusCodes.OK,
    });
  } catch (error) {
    return mapError(error);
  }
}
