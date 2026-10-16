import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  progressReports as handlers,
  requireProgressReportAccess,
} from "../../handlers";
import { ConstructionSiteWorkProgressReportParamsModel } from "../../progress-report-models";

export const dynamic = "force-dynamic";
/** A report runs after the response, in this invocation (ADR CM-0021 §1). */
export const maxDuration = 300;

/**
 * Deletes a Daily Progress Report and its PDF. The date keeps its DPR
 * number, so generating it again reuses the number. Needs Progress Report
 * delete.
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
    const session = await requireProgressReportAccess(request, id, "delete");
    if (isResponse(session)) return session;
    await handlers.delete(session.access, id);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
