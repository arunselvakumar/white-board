import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { labour } from "../../handlers";
import { LabourIdParamsModel, toLabourResponse } from "../../labour-models";

export const dynamic = "force-dynamic";

/** Marks a labourer Inactive: they leave attendance pickers; their records stay (CM-206). */
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
    const updated = await labour.labours.setActive({
      workspaceId: session.workspaceId,
      id,
      active: false,
      by: session.userId,
    });
    return Response.json(toLabourResponse(updated, session.access));
  } catch (error) {
    return mapError(error);
  }
}
