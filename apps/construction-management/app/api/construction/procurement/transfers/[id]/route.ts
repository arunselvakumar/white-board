import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { materialTransfers, requireTransferSession } from "../handlers";
import {
  ConstructionProcurementMaterialTransferParamsModel,
  toTransferResponse,
} from "../transfer-models";

export const dynamic = "force-dynamic";

/** One live Material Transfer with its lines (Read on either side). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireTransferSession(request, false);
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionProcurementMaterialTransferParamsModel.safeParse(
        await context.params,
      ),
    );
    return Response.json(
      toTransferResponse(await materialTransfers.get(session.caller, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
