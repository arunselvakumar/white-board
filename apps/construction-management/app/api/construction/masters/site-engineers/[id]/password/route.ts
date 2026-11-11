import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { ConstructionMastersIdParamsModel } from "../../../_lib/master-models";
import { siteEngineerHandlers as handlers } from "../../handlers";
import {
  SITE_ENGINEER_MENU,
  SetConstructionMastersSiteEngineerPasswordRequestModel,
  toSiteEngineerResponse,
} from "../../site-engineer-models";

export const dynamic = "force-dynamic";

/**
 * A new temporary password for their sign-in (ADR CM-0030 §7): they must
 * change it at their next sign-in. 403 `CANNOT_GRANT` unless the caller
 * holds every cell of the Site Engineer Role, `OWN_ROLE` for their own.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(request, SITE_ENGINEER_MENU, "update");
    if (isResponse(session)) return session;
    const { id } = parseOrThrow(
      ConstructionMastersIdParamsModel.safeParse(await context.params),
    );
    const { password } = parseOrThrow(
      SetConstructionMastersSiteEngineerPasswordRequestModel.safeParse(
        await request.json(),
      ),
    );
    const item = await handlers.setPassword({
      workspaceId: session.workspaceId,
      id,
      by: session.userId,
      grantor: session.access,
      password,
    });
    return Response.json({
      ...toSiteEngineerResponse(item, session.access),
      passwordIgnored: item.passwordIgnored,
    });
  } catch (error) {
    return mapError(error);
  }
}
