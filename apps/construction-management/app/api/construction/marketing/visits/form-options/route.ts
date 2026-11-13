import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { VISITS_MENU, visitHandlers as handlers } from "../handlers";
import { toVisitFormOptions } from "../visit-models";

export const dynamic = "force-dynamic";

/**
 * Active Marketing People, the caller's own member id, and the Prospect
 * Companies they can pick, for the Visit form and the list's filters.
 * Needs Visits read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, VISITS_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toVisitFormOptions(await handlers.formOptions(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
