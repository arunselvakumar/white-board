import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { can, type Flag } from "@/src/shared-kernel/access";
import {
  EQUIPMENT_MENU,
  EQUIPMENT_USAGE_MENU,
} from "@/src/site-work/application/equipment-handlers";

import {
  GetConstructionSiteWorkEquipmentFormOptionsRequestModel,
  type GetConstructionSiteWorkEquipmentFormOptionsResponseModel,
} from "../equipment-models";
import {
  equipmentHandlers as handlers,
  requireEquipmentAccess,
} from "../handlers";
import type { z } from "zod";

export const dynamic = "force-dynamic";

const REGISTER_FLAGS: readonly Flag[] = [
  "read",
  "create",
  "update",
  "transfer",
];

/**
 * The equipment form's and transfer dialog's choices: live, enabled
 * Contractors (hire parties) and live Projects. Needs a register flag, or
 * Equipment Usage Read / Create on `projectId`.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionSiteWorkEquipmentFormOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireEquipmentAccess(
      request,
      (access) =>
        REGISTER_FLAGS.some((flag) => can(access, EQUIPMENT_MENU, flag)) ||
        (model.projectId != null &&
          (["read", "create"] as const).some((flag) =>
            can(access, EQUIPMENT_USAGE_MENU, flag, {
              projectId: model.projectId,
            }),
          )),
      { write: false },
    );
    if (isResponse(session)) return session;
    const body: z.infer<
      typeof GetConstructionSiteWorkEquipmentFormOptionsResponseModel
    > = await handlers.formOptions(session.workspaceId);
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
