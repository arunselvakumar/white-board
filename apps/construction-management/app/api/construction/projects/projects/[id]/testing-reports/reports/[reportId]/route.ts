import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectTestingReports } from "../../handlers";
import { ConstructionProjectsTestingReportParamsModel } from "../../testing-report-models";
import { toTestingReportResponse } from "../../testing-report-responses";

export const dynamic = "force-dynamic";

/** One testing report (CM-409). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; reportId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.testing_reports",
      "read",
    );
    if (isResponse(session)) return session;
    const { id, reportId } = parseOrThrow(
      ConstructionProjectsTestingReportParamsModel.safeParse(
        await context.params,
      ),
    );
    return Response.json(
      toTestingReportResponse(
        await projectTestingReports.report(session.access, id, reportId),
      ),
    );
  } catch (error) {
    return mapError(error);
  }
}
