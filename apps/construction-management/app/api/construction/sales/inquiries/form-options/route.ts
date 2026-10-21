import { mapError } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";
import { requestProjectId } from "@/app/api/construction/sales/project-scope";
import { requireSalesProjectAccess } from "@/app/api/construction/sales/sales-access";

import { INQUIRY_MENU, inquiryHandlers as handlers } from "../handlers";
import { toInquiryFormOptions } from "../inquiry-models";

export const dynamic = "force-dynamic";

/**
 * The inquiry form's and filters' pickers on a Project (CM-1003): active
 * Team Members on it, its live Wings, Funnel Stages in order and the
 * enabled Lead Sources and Lost Reasons. Needs Inquiry read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const projectId = requestProjectId(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const session = await requireSalesProjectAccess(
      request,
      INQUIRY_MENU,
      "read",
      projectId,
    );
    if (isResponse(session)) return session;
    return Response.json(
      toInquiryFormOptions(
        await handlers.formOptions(session.access, projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
