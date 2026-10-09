import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { requireAccess } from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  isMoneyReport,
  type ReportParams,
} from "@/src/reporting/domain/report-job";

import {
  canSeeMoney,
  permissionDenied,
  REPORT_MENU,
  reportableKinds,
  reports,
  requireReportSession,
} from "./handlers";
import {
  ListConstructionReportingReportsRequestModel,
  RequestConstructionReportingReportRequestModel,
  toReportJobResponse,
  type ListConstructionReportingReportsResponseModel,
} from "./report-models";

export const dynamic = "force-dynamic";

function paramsOf(
  model: RequestConstructionReportingReportRequestModel,
  projectIds: string[] | null,
): ReportParams {
  switch (model.kind) {
    case "labour_attendance":
    case "labour_payment":
      return { kind: model.kind, from: model.params.from, to: model.params.to };
    case "labour_month":
    case "muster_roll":
      return { kind: model.kind, month: model.params.month };
    case "vendor_attendance":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        vendorId: model.params.vendorId ?? null,
        labourCategoryId: model.params.categoryId ?? null,
        projectIds,
      };
  }
}

/**
 * Requests a report (CM-217, CM-218): the job is queued and, until M9's
 * queue, run inline, so the response is usually `done` with download links
 * (or `failed` with a message). Needs `report` on the kind's menu and
 * Project; the payment report and the muster roll are about money and are
 * refused without Financial. Other reports print amounts only with it.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      RequestConstructionReportingReportRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await requireAccess(
      request,
      REPORT_MENU[model.kind],
      "report",
      model.projectId == null ? {} : { projectId: model.projectId },
    );
    if (isResponse(session)) return session;
    const financial = canSeeMoney(session.access, model.kind, model.projectId);
    if (isMoneyReport(model.kind) && !financial)
      return permissionDenied(
        "This report is about amounts: it needs Financial on Labour. Ask the Owner to change your Permission Matrix.",
      );
    // A central report covers the Projects the requester may see now.
    const projectIds =
      model.projectId == null && session.role !== "owner"
        ? [...session.access.projectIds]
        : null;
    const job = await reports.request({
      workspaceId: session.workspaceId,
      userId: session.userId,
      projectId: model.projectId,
      params: paramsOf(model, projectIds),
      includesMoney: financial && model.kind !== "labour_attendance",
    });
    return Response.json(toReportJobResponse(job), {
      status: StatusCodes.CREATED,
    });
  } catch (error) {
    return mapError(error);
  }
}

/**
 * The newest 50 reports of a Project, of the kinds this Team Member may
 * report on; without `projectId`, their own central reports.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      ListConstructionReportingReportsRequestModel.safeParse(
        Object.fromEntries(new URL(request.url).searchParams),
      ),
    );
    const session = await requireReportSession(request);
    if (isResponse(session)) return session;
    const projectId = model.projectId ?? null;
    const kinds = reportableKinds(session.access, projectId);
    if (kinds.length === 0) return permissionDenied();
    const jobs = await reports.list(session.workspaceId, {
      projectId,
      kinds,
      requestedBy: projectId == null ? session.userId : undefined,
    });
    const body: ListConstructionReportingReportsResponseModel = {
      items: jobs.map(toReportJobResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
