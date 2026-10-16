import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  canReport,
  permissionDenied,
  reports,
  requireOwnReport,
} from "../../handlers";
import {
  ConstructionReportingReportParamsModel,
  toReportJobResponse,
} from "../../report-models";

export const dynamic = "force-dynamic";
/** A report runs after the response, in this invocation (ADR CM-0021 §1). */
export const maxDuration = 300;

/**
 * Runs a failed report again with the same filters (CM-901): it goes back
 * on the queue and the response is the queued job. Only its requester or
 * the Owner, still holding Report on its menu and Project; 409
 * `REPORT_NOT_FAILED` unless it failed. A Progress Report retries from
 * its own module.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionReportingReportParamsModel.safeParse(await context.params),
    );
    const session = await requireOwnReport(request, id);
    if (isResponse(session)) return session;
    const { job } = session;
    if (!canReport(session.access, job.kind, job.projectId))
      return permissionDenied();
    return Response.json(toReportJobResponse(await reports.retry(job)));
  } catch (error) {
    return mapError(error);
  }
}
