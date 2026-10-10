import {
  FileDownloadQueryModel,
  storedFileResponse,
} from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectTestingReports } from "../../../handlers";
import { ConstructionProjectsTestingReportParamsModel } from "../../../testing-report-models";

export const dynamic = "force-dynamic";

/**
 * Streams a report's file (CM-409), shown in the browser; `?download=1`
 * saves it. The Gallery links here, so a member without
 * `projects.testing_reports` read gets 403.
 */
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
    const query = parseOrThrow(
      FileDownloadQueryModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const { report, object } = await projectTestingReports.readFile(
      session.access,
      id,
      reportId,
    );
    return storedFileResponse(report, object, query.download === "1");
  } catch (error) {
    return mapError(error);
  }
}
