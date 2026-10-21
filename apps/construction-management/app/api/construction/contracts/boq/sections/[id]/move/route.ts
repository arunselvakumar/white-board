import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { boqHandlers, requireBoqRecordAccess } from "../../../boq-access";
import {
  ConstructionContractsBoqParamsModel,
  MoveConstructionContractsBoqRequestModel,
} from "../../../boq-models";

export const dynamic = "force-dynamic";

/** Moves a section one place up or down the BOQ (CM-1103). Needs BOQ update. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionContractsBoqParamsModel.safeParse(await context.params),
    );
    const session = await requireBoqRecordAccess(request, "update", (ws) =>
      boqHandlers.findSection(ws, id),
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      MoveConstructionContractsBoqRequestModel.safeParse(await request.json()),
    );
    await boqHandlers.moveSection(session.access, id, model.direction);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
