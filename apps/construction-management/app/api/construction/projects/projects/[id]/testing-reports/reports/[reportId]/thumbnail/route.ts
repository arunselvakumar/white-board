import { thumbnailResponse } from "@/app/api/_lib/attachments";
import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { projectTestingReports } from "../../../handlers";
import { ConstructionProjectsTestingReportParamsModel } from "../../../testing-report-models";

export const dynamic = "force-dynamic";

/** A report image's WebP thumbnail (CM-407); 404 `THUMBNAIL_NOT_FOUND` without one. */
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
    return thumbnailResponse(
      await projectTestingReports.readThumbnail(session.access, id, reportId),
    );
  } catch (error) {
    return mapError(error);
  }
}
