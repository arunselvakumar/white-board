import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectTestingReports } from "../../../handlers";
import { ConstructionProjectsTestingReportParamsModel } from "../../../testing-report-models";

export const dynamic = "force-dynamic";

/** Deletes a report (CM-409): a tombstone, out of the Gallery, then the file goes. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; reportId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.testing_reports",
      "delete",
    );
    if (isResponse(session)) return session;
    const { id, reportId } = parseOrThrow(
      ConstructionProjectsTestingReportParamsModel.safeParse(
        await context.params,
      ),
    );
    await projectTestingReports.deleteReport({
      viewer: session.access,
      projectId: id,
      reportId,
      by: session.userId,
    });
    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (error) {
    return mapError(error);
  }
}
