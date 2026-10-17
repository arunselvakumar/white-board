import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import { reports, requireOwnReport } from "../../handlers";
import { ConstructionReportingReportParamsModel } from "../../report-models";

export const dynamic = "force-dynamic";

/**
 * Deletes a report and its files (CM-901): its stored bytes stop counting
 * and an audit event is written. Only its requester or the Owner. A
 * Progress Report is deleted from its own module.
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
    await reports.remove(session.job, session.userId);
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
