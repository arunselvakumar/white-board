import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { toFollowUpFormOptions } from "../follow-up-models";
import { FOLLOW_UPS_MENU, followUpHandlers as handlers } from "../handlers";

export const dynamic = "force-dynamic";

/**
 * Active Marketing People, and inactive ones too for the list's owner
 * filter, the caller's own member id, the companies they can pick and the
 * Company's today. Needs Follow-ups read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, FOLLOW_UPS_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toFollowUpFormOptions(await handlers.formOptions(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
