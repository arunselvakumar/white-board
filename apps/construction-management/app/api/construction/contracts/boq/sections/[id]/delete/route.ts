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
 * Deletes an empty section (CM-1103): 409 BOQ_SECTION_NOT_EMPTY while it
 * has live items (`details.count`), 409 VARIATION_PENDING while a pending
 * extra item would join it. Needs BOQ delete.
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
      boqHandlers.findSection(ws, id),
    );
    if (isResponse(session)) return session;
    const text = await request.text();
    const model = parseOrThrow(
      DeleteConstructionContractsBoqRequestModel.safeParse(
        text.trim() === "" ? {} : JSON.parse(text),
      ),
    );
    await boqHandlers.deleteSection(
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
