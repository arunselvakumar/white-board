import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";
import { salesSettingsHandlers as handlers } from "@/src/composition/sales-settings";

import { toSalesSettingsResponse } from "./settings-models";
import { SALES_SETTINGS_MENU } from "./settings-routes";

export const dynamic = "force-dynamic";

/**
 * A Project's sales settings (CM-1002): its Funnel Stages in funnel order
 * with the Open inquiries in each, and its Lead Sources and Lost Reasons
 * (disabled ones included) with the inquiries using each. Needs Inquiry
 * read on the Project; `canManage` says whether the caller holds Update.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const projectId = requestProjectId(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const session = await requireSalesProjectAccess(
      request,
      SALES_SETTINGS_MENU,
      "read",
      projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toSalesSettingsResponse(
        await handlers.settings(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
