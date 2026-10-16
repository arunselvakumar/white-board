import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  progressReports as handlers,
  requireProgressReportAccess,
} from "../../handlers";
import {
  ConstructionSiteWorkProgressReportParamsModel,
  toProgressReportResponse,
} from "../../progress-report-models";

export const dynamic = "force-dynamic";
/** A report runs after the response, in this invocation (ADR CM-0021 §1). */
export const maxDuration = 300;

/**
 * Runs a failed Daily Progress Report again, with the same number, date
 * and filters (409 `REPORT_NOT_FAILED` otherwise). Needs Progress Report
 * create.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkProgressReportParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireProgressReportAccess(request, id, "create");
    if (isResponse(session)) return session;
    return Response.json(
      toProgressReportResponse(await handlers.retry(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
