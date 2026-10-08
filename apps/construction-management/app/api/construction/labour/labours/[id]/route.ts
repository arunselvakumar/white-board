import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { labour } from "../handlers";
import { LabourIdParamsModel, toLabourResponse } from "../labour-models";

export const dynamic = "force-dynamic";

/** One labourer of the Active Company (CM-207). */
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
    return Response.json(
      toLabourResponse(
        await labour.labours.get(session.workspaceId, id),
        session.access,
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
