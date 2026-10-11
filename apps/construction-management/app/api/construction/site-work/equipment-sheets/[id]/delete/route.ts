import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  ConstructionSiteWorkEquipmentSheetParamsModel,
  DeleteConstructionSiteWorkEquipmentSheetRequestModel,
} from "../../equipment-sheet-models";
import {
  equipmentSheetHandlers as handlers,
  requireEquipmentSheetAccess,
} from "../../handlers";

export const dynamic = "force-dynamic";

/** Deletes an Equipment Usage sheet and reverses its stock postings (delete on its Project). */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkEquipmentSheetParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireEquipmentSheetAccess(request, id, "delete");
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      DeleteConstructionSiteWorkEquipmentSheetRequestModel.safeParse(
        await request.json(),
      ),
    );
    await handlers.delete(
      session.access,
      id,
      new Date(model.expectedUpdatedAt),
    );
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
