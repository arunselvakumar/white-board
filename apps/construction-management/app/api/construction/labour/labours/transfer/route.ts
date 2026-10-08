import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { labour } from "../handlers";
import {
  TransferConstructionLabourLaboursRequestModel,
  toLabourResponse,
} from "../labour-models";

export const dynamic = "force-dynamic";

/**
 * Transfers one or many labourers to a Project from a date (CM-206). Needs
 * `transfer` on Labour for the destination and for every source Project.
 * All or none.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const raw: unknown = await request.json();
    const model = parseOrThrow(
      TransferConstructionLabourLaboursRequestModel.safeParse(raw),
    );
    const session = await requireAccess(request, "labour.labour", "transfer", {
      projectId: model.toProjectId,
    });
    if (isResponse(session)) return session;
    const items = await labour.labours.transfer({
      workspaceId: session.workspaceId,
      access: session.access,
      labourIds: model.labourIds,
      toProjectId: model.toProjectId,
      transferDate: model.transferDate,
      remark: model.remark,
      by: session.userId,
    });
    return Response.json({
      items: items.map((item) => toLabourResponse(item, session.access)),
    });
  } catch (error) {
    return mapError(error);
  }
}
