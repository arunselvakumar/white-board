import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionSiteWorkEquipmentSheetParamsModel } from "../equipment-sheet-models";
import {
  equipmentSheetResponse,
  requireEquipmentSheetAccess,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * One Equipment Usage sheet with the names of what it points at and the
 * equipment's previous closing reading (read on its Project).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkEquipmentSheetParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireEquipmentSheetAccess(request, id, "read");
    if (isResponse(session)) return session;
    return await equipmentSheetResponse(session, id);
  } catch (error) {
    return mapError(error);
  }
}
