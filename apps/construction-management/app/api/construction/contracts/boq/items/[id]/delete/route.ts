import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { boqHandlers, requireBoqRecordAccess } from "../../../boq-access";
import {
  ConstructionContractsBoqParamsModel,
  DeleteConstructionContractsBoqRequestModel,
} from "../../../boq-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a BOQ item (a tombstone; CM-1103): 409 BOQ_ITEM_MEASURED once a
 * checked measurement names it, 409 VARIATION_PENDING while a Variation of
 * it waits. Needs BOQ delete.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsBoqParamsModel.safeParse(await context.params),
    );
    const session = await requireBoqRecordAccess(request, "delete", (ws) =>
      boqHandlers.findItem(ws, id),
    );
    if (isResponse(session)) return session;
    const text = await request.text();
    const model = parseOrThrow(
      DeleteConstructionContractsBoqRequestModel.safeParse(
        text.trim() === "" ? {} : JSON.parse(text),
      ),
    );
    await boqHandlers.deleteItem(
      session.access,
      id,
      model.expectedUpdatedAt == null
        ? null
        : new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
