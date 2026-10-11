import type { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  GetConstructionSiteWorkEquipmentSheetAvailableStockRequestModel,
  type GetConstructionSiteWorkEquipmentSheetAvailableStockResponseModel,
} from "../equipment-sheet-models";
import {
  EQUIPMENT_SHEET_MENU,
  equipmentSheetHandlers as handlers,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Stock per material at the Project on the sheet date, shown next to
 * each material line (CM-0016 §5); when editing, the sheet's own
 * consumption is added back. Needs Equipment Usage read on the Project.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionSiteWorkEquipmentSheetAvailableStockRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, EQUIPMENT_SHEET_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const stock = await handlers.availableStock(
      session.workspaceId,
      model.projectId,
      model.date,
      model.materialIds,
      model.excludeSheetId ?? null,
    );
    const body: z.infer<
      typeof GetConstructionSiteWorkEquipmentSheetAvailableStockResponseModel
    > = { stock: Object.fromEntries(stock) };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
