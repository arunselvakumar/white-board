import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { requireBoqRecordAccess, variationHandlers } from "../../../boq-access";
import {
  ConstructionContractsBoqParamsModel,
  DeleteConstructionContractsBoqRequestModel,
} from "../../../boq-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a pending Variation (a tombstone; CM-1103). Its creator (with
 * BOQ create) or a holder of BOQ update. 409 VARIATION_NOT_PENDING once
 * decided.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsBoqParamsModel.safeParse(await context.params),
    );
    const session = await requireBoqRecordAccess(
      request,
      ["create", "update"],
      (ws) => variationHandlers.find(ws, id),
    );
    if (isResponse(session)) return session;
    const text = await request.text();
    const model = parseOrThrow(
      DeleteConstructionContractsBoqRequestModel.safeParse(
        text.trim() === "" ? {} : JSON.parse(text),
      ),
    );
    await variationHandlers.delete(
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
