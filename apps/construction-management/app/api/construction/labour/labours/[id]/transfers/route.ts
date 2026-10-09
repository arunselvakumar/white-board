import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { labour } from "../../handlers";
import {
  LabourIdParamsModel,
  type ListConstructionLabourLabourTransfersResponseModel,
} from "../../labour-models";

export const dynamic = "force-dynamic";

/** The labourer's Project history, oldest first (CM-206). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.labours", "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      LabourIdParamsModel.safeParse(await context.params),
    );
    const rows = await labour.labours.transfers(session.workspaceId, id);
    const body: ListConstructionLabourLabourTransfersResponseModel = {
      items: rows.map((row) => ({
        id: row.id,
        fromProject: row.fromProject,
        toProject: row.toProject,
        transferDate: row.transferDate,
        remark: row.remark,
        createdAt: row.createdAt.toISOString(),
      })),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
