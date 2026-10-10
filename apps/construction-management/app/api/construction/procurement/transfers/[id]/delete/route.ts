import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { materialTransfers, requireTransferSession } from "../../handlers";
import {
  ConstructionProcurementMaterialTransferParamsModel,
  DeleteConstructionProcurementMaterialTransferRequestModel,
} from "../../transfer-models";

export const dynamic = "force-dynamic";

/** Delete a pending transfer (Delete on its source); its number is not reused. */
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
    const model = parseOrThrow(
      DeleteConstructionProcurementMaterialTransferRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireTransferSession(request, true);
    if (isResponse(session)) return session;
    await materialTransfers.remove(
      session.caller,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
