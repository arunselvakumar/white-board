import type { z } from "zod";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  BulkRejectConstructionSiteWorkEquipmentSheetsRequestModel,
  type BulkDecideConstructionSiteWorkEquipmentSheetsResponseModel,
} from "../equipment-sheet-models";
import {
  EQUIPMENT_SHEET_MENU,
  equipmentSheetHandlers as handlers,
} from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Rejects several pending Equipment Usage sheets of one Project at once, with one reason. All or none (CM-0015 §2): if any is not pending or not the
 * Project's, nothing changes and 409 `BULK_DECISION_REFUSED` lists each
 * refusal. Needs reject on the Project.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      BulkRejectConstructionSiteWorkEquipmentSheetsRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      EQUIPMENT_SHEET_MENU,
      "reject",
      {
        projectId: model.projectId,
      },
    );
    if (isResponse(session)) return session;
    const decided = await handlers.bulkDecide(
      session.access,
      model.projectId,
      model.ids,
      { approve: false, reason: model.reason },
    );
    const body: z.infer<
      typeof BulkDecideConstructionSiteWorkEquipmentSheetsResponseModel
    > = { decided };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
