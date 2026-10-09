import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  mayOpen,
  permissionDenied,
  reports,
  requireReportSession,
} from "../handlers";
import {
  ConstructionReportingReportParamsModel,
  toReportJobResponse,
} from "../report-models";

export const dynamic = "force-dynamic";

/** One report job: status, error, download links (CM-217). Another Company's job is 404. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionReportingReportParamsModel.safeParse(await context.params),
    );
    const session = await requireReportSession(request);
    if (isResponse(session)) return session;
    const job = await reports.get(session.workspaceId, id);
    if (!mayOpen(session, job)) return permissionDenied();
    return Response.json(toReportJobResponse(job));
  } catch (error) {
    return mapError(error);
  }
}
