import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { isResponse } from "@/app/api/_lib/require-session";

import {
  canSeeMoney,
  mayOpen,
  permissionDenied,
  reports,
  requireReportSession,
} from "../../handlers";
import {
  ConstructionReportingReportParamsModel,
  DownloadConstructionReportingReportRequestModel,
} from "../../report-models";

export const dynamic = "force-dynamic";

/**
 * Streams a done report's Excel or PDF from private storage (CM-217),
 * after checking access again: `report` on the menu and Project, and
 * Financial when the file carries amounts. 409 `REPORT_NOT_READY` until
 * the job is done.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = parseOrThrow(
      ConstructionReportingReportParamsModel.safeParse(await context.params),
    );
    const { format } = parseOrThrow(
      DownloadConstructionReportingReportRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireReportSession(request);
    if (isResponse(session)) return session;
    const job = await reports.get(session.workspaceId, id);
    if (!mayOpen(session, job)) return permissionDenied();
    if (
      job.includesMoney &&
      !canSeeMoney(session.access, job.kind, job.projectId)
    )
      return permissionDenied(
        "This report shows amounts: it needs Financial. Ask the Owner to change your Permission Matrix.",
      );
    const file = await reports.download(job, format);
    const headers: Record<string, string> = {
      "content-type": file.contentType,
      "content-disposition": `attachment; filename="${file.fileName}"`,
      "cache-control": "private, no-store",
    };
    if (file.contentLength != null)
      headers["content-length"] = String(file.contentLength);
    return new Response(file.body, { headers });
  } catch (error) {
    return mapError(error);
  }
}
