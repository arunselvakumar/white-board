import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectTestingReports } from "../../../handlers";
import {
  ConstructionProjectsTestingReportParamsModel,
  UpdateConstructionProjectsTestingReportRequestModel,
} from "../../../testing-report-models";
import { toTestingReportResponse } from "../../../testing-report-responses";

export const dynamic = "force-dynamic";

/**
 * Edits a report and, with `file`, replaces its file (CM-409). 409
 * `TESTING_REPORT_CHANGED` on a stale `updatedAt`; 403 under the
 * back-dated policy for the stored or the new date.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; reportId: string }> },
): Promise<Response> {
  try {
    const session = await requireAccess(
      request,
      "projects.testing_reports",
      "update",
    );
    if (isResponse(session)) return session;
    const { id, reportId } = parseOrThrow(
      ConstructionProjectsTestingReportParamsModel.safeParse(
        await context.params,
      ),
    );
    const body = parseOrThrow(
      UpdateConstructionProjectsTestingReportRequestModel.safeParse(
        await request.json(),
      ),
    );
    const report = await projectTestingReports.updateReport({
      viewer: session.access,
      projectId: id,
      reportId,
      details: {
        name: body.name,
        reportDate: body.reportDate,
        remark: body.remark ?? null,
      },
      expectedUpdatedAt: new Date(body.updatedAt),
      file: body.file ?? null,
      by: session.userId,
    });
    return Response.json(toTestingReportResponse(report));
  } catch (error) {
    return mapError(error);
  }
}
