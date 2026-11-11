import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionMastersIdParamsModel } from "../../../_lib/master-models";
import { siteEngineerHandlers as handlers } from "../../handlers";
import { SITE_ENGINEER_MENU } from "../../site-engineer-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a Site Engineer (409 SUPERVISOR_IN_USE while Labours or
 * attendance name them) and takes back their own sign-in.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, SITE_ENGINEER_MENU, "delete");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMastersIdParamsModel.safeParse(await context.params),
    );
    await handlers.delete({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return mapError(error);
  }
}
