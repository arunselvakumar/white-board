import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireReportSession } from "@/app/api/_lib/require-report-session";
import { createReportHandlers } from "@/src/training-institute/infrastructure/create-report-handlers";

import {
  DownloadTrainingInstituteReportRequestModel,
  reportQuery,
  searchParamsObject,
} from "../../report-models";
import { reportKey, type ReportRouteContext } from "../report-route";

export const dynamic = "force-dynamic";

const handlers = createReportHandlers();

/** The report as Excel or PDF: exactly what the session sees on screen. */
export async function GET(
  request: Request,
  context: ReportRouteContext,
): Promise<Response> {
  try {
    const session = await requireReportSession();
    if (session instanceof Response) return session;
    const key = await reportKey(context);
    const { format, ...query } = parseOrThrow(
      DownloadTrainingInstituteReportRequestModel.safeParse(
        searchParamsObject(new URL(request.url)),
      ),
    );
    const file = await handlers.download(
      session,
      key,
      reportQuery(query),
      format,
    );
    return new Response(Buffer.from(file.bytes), {
      headers: {
        "content-type": file.contentType,
        "content-disposition": `attachment; filename="${file.filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return mapError(error);
  }
}
