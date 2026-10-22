import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  requestProjectId,
  requireWorkOrderProjectAccess,
  workOrderHandlers,
} from "../work-order-access";
import {
  ListConstructionContractsWorkOrderMaterialOptionsRequestModel,
  toMaterialOptionsResponse,
} from "../work-order-models";

export const dynamic = "force-dynamic";

/**
 * Enabled Materials for the materials panel, by name, 25 at a time
 * (CM-1104). The unit rate is null without Work Order Financial. Needs
 * Work Order create or update.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const raw = Object.fromEntries(new URL(request.url).searchParams);
    const projectId = requestProjectId(raw);
    const session = await requireWorkOrderProjectAccess(
      request,
      ["create", "update"],
      projectId,
    );
    if (isResponse(session)) return session;
    const model = parseOrThrow(
      ListConstructionContractsWorkOrderMaterialOptionsRequestModel.safeParse(
        raw,
      ),
    );
    const materials = await workOrderHandlers.materialOptions(
      session.access,
      projectId,
      model.q,
    );
    return Response.json(
      toMaterialOptionsResponse(
        materials,
        workOrderHandlers.financial(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
