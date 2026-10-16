import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { PROGRESS_REPORT_MENU, progressReports as handlers } from "../handlers";
import {
  GetConstructionSiteWorkProgressReportFormOptionsRequestModel,
  toProgressReportFormOptions,
} from "../progress-report-models";

export const dynamic = "force-dynamic";
/** A report runs after the response, in this invocation (ADR CM-0021 §1). */
export const maxDuration = 300;

/**
 * What Create new offers: the Company's today, the Project's Team Members
 * for Report Filled By, and the report types. Needs Progress Report create.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      GetConstructionSiteWorkProgressReportFormOptionsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(
      request,
      PROGRESS_REPORT_MENU,
      "create",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    return Response.json(
      toProgressReportFormOptions(
        await handlers.formOptions(session.access, model.projectId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
