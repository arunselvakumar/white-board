import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  progressReports as handlers,
  requireProgressReportAccess,
} from "../handlers";
import {
  ConstructionSiteWorkProgressReportParamsModel,
  toProgressReportResponse,
} from "../progress-report-models";

export const dynamic = "force-dynamic";

/** One Daily Progress Report: its status, error and download link. Needs read. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionSiteWorkProgressReportParamsModel.safeParse(
        await context.params,
      ),
    );
    const session = await requireProgressReportAccess(request, id, "read");
    if (isResponse(session)) return session;
    return Response.json(
      toProgressReportResponse(await handlers.get(session.access, id)),
    );
  } catch (error) {
    return mapError(error);
  }
}
