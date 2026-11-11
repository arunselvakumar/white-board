import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionMastersIdParamsModel } from "../../_lib/master-models";
import { siteEngineerHandlers as handlers } from "../handlers";
import {
  SITE_ENGINEER_MENU,
  toSiteEngineerResponse,
} from "../site-engineer-models";

export const dynamic = "force-dynamic";

/** One Site Engineer, enabled or disabled, with how they sign in. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, SITE_ENGINEER_MENU, "read");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMastersIdParamsModel.safeParse(await context.params),
    );
    const item = await handlers.get(session.workspaceId, id);
    return Response.json(toSiteEngineerResponse(item, session.access));
  } catch (error) {
    return mapError(error);
  }
}
