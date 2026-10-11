import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";

import { PROGRESS_REPORT_MENU, progressReports as handlers } from "./handlers";
import {
  CreateConstructionSiteWorkProgressReportRequestModel,
  ListConstructionSiteWorkProgressReportsRequestModel,
  toProgressReportResponse,
  type ListConstructionSiteWorkProgressReportsResponse,
} from "./progress-report-models";

export const dynamic = "force-dynamic";

/**
 * A Project's Daily Progress Reports, newest first (the latest 50), with
 * what the viewer may do with each. Needs Progress Report read.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionSiteWorkProgressReportsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireAccess(request, PROGRESS_REPORT_MENU, "read", {
      projectId: model.projectId,
    });
    if (isResponse(session)) return session;
    const items = await handlers.list(session.access, model.projectId);
    const body: ListConstructionSiteWorkProgressReportsResponse = {
      items: items.map(toProgressReportResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}

/**
 * Generates a Daily Progress Report (CM-606): takes the date's DPR number
 * the first time (reused after), then runs the job inline with a
 * 60-second limit, so it usually comes back done or failed. Hire cost
 * prints only when the requester holds Financial on Equipment Usage.
 * Needs Progress Report create.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      CreateConstructionSiteWorkProgressReportRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      PROGRESS_REPORT_MENU,
      "create",
      { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const report = await handlers.request(session.access, model);
    return Response.json(toProgressReportResponse(report), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}
