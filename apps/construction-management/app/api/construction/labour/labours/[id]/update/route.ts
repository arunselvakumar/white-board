import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { labour } from "../../handlers";
import {
  LabourIdParamsModel,
  UpdateConstructionLabourLabourRequestModel,
  toLabourResponse,
} from "../../labour-models";

export const dynamic = "force-dynamic";

/**
 * Edits a labourer (CM-205). A changed opening balance or joining date
 * reverses the old opening entry and posts the new one. 409
 * `LABOUR_CHANGED` when someone saved since `expectedUpdatedAt`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, "masters.labours", "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      LabourIdParamsModel.safeParse(await context.params),
    );
    const model = parseOrThrow(
      UpdateConstructionLabourLabourRequestModel.safeParse(
        await request.json(),
      ),
    );
    const updated = await labour.labours.update({
      workspaceId: session.workspaceId,
      id,
      labour: {
        ...model,
        expectedUpdatedAt: new Date(model.expectedUpdatedAt),
      },
      by: session.userId,
    });
    return Response.json(toLabourResponse(updated, session.access));
  } catch (error) {
    return mapError(error);
  }
}
