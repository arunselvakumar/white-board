import { mapError } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { BOQ_MENU, boqHandlers } from "../boq-access";
import { toSettingsResponse } from "../boq-models";

export const dynamic = "force-dynamic";

/**
 * The Company's deviation limit (CM-1103, default 25 %). Company-level:
 * BOQ read held on any Project; `canUpdate` says whether the caller holds
 * BOQ Update and may change it.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requireAccess(request, BOQ_MENU, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toSettingsResponse(await boqHandlers.settings(session.access)),
    );
  } catch (error) {
    return mapError(error);
  }
}
