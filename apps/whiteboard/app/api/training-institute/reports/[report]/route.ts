import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireReportSession } from "@/app/api/_lib/require-report-session";
import { createReportHandlers } from "@/src/training-institute/infrastructure/create-report-handlers";

import {
  reportQuery,
  searchParamsObject,
  TrainingInstituteReportQueryModel,
} from "../report-models";
import { reportKey, type ReportRouteContext } from "./report-route";

export const dynamic = "force-dynamic";

const handlers = createReportHandlers();

/** One report, built for the session's role. Reading it changes nothing. */
export async function GET(
  request: Request,
  context: ReportRouteContext,
): Promise<Response> {
  try {
    const session = await requireReportSession();
    if (session instanceof Response) return session;
    const key = await reportKey(context);
    const query = parseOrThrow(
      TrainingInstituteReportQueryModel.safeParse(
        searchParamsObject(new URL(request.url)),
      ),
    );
    return Response.json(
      await handlers.build(session, key, reportQuery(query)),
    );
  } catch (error) {
    return mapError(error);
  }
}
