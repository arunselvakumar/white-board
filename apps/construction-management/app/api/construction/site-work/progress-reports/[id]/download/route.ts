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
 * Streams a done Daily Progress Report's PDF from private storage (it has
 * no Excel). Needs Progress Report read, and Financial on Equipment Usage
 * when it shows hire cost; 409 `REPORT_NOT_READY` until it is done.
 */
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
    const file = await handlers.download(session.access, id);
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
