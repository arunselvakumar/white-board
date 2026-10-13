import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireReportSession } from "@/app/api/_lib/require-report-session";
import { createReportHandlers } from "@/src/training-institute/infrastructure/create-report-handlers";

import {
  EmailTrainingInstituteReportRequestModel,
  reportQuery,
} from "../../report-models";
import { reportKey, type ReportRouteContext } from "../report-route";

export const dynamic = "force-dynamic";

const handlers = createReportHandlers();

/**
 * Owner only, after confirming: R11 or R18 to each Student's linked parents,
 * or any report to the Owner's own account email. Never automatic.
 */
export async function POST(
  request: Request,
  context: ReportRouteContext,
): Promise<Response> {
  try {
    const session = await requireReportSession();
    if (session instanceof Response) return session;
    const key = await reportKey(context);
    const body = parseOrThrow(
      EmailTrainingInstituteReportRequestModel.safeParse(await request.json()),
    );
    if (body.to === "self") {
      const { email } = await handlers.emailToSelf(
        session,
        key,
        reportQuery(body.query),
      );
      return Response.json({ sent: [{ studentName: "", email }], notSent: [] });
    }
    return Response.json(
      await handlers.emailToParents(session, key, reportQuery(body.query)),
    );
  } catch (error) {
    return mapError(error);
  }
}
