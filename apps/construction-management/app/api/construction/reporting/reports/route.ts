import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { jsonError } from "@/app/api/_lib/json-error";
import {
  requireAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import {
  isMoneyReport,
  printsAmounts,
  type ReportOwnScope,
  type ReportParams,
} from "@/src/reporting/domain/report-job";

import {
  canSeeMoney,
  ledgerRefusal,
  mayOpen,
  pettyCashAccountScope,
  permissionDenied,
  REPORT_MENU,
  reportableKinds,
  reports,
  requireReportSession,
  trackingOwnScope,
} from "./handlers";
import {
  ListConstructionReportingReportsRequestModel,
  RequestConstructionReportingReportRequestModel,
  toReportJobResponse,
  type ListConstructionReportingReportsResponseModel,
} from "./report-models";

export const dynamic = "force-dynamic";
/** A report runs after the response, in this invocation (ADR CM-0021 §1). */
export const maxDuration = 300;

function paramsOf(
  model: RequestConstructionReportingReportRequestModel,
  projectIds: string[] | null,
  pettyCashAccounts: string[] | null,
  own: ReportOwnScope | null,
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
    // Site work reports (CM-605, CM-608).
    case "daily_work":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        contractorId: model.params.contractorId ?? null,
      };
    case "owned_equipment_usage":
    case "rented_equipment_usage":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        equipmentId: model.params.equipmentId ?? null,
      };
    case "equipment_maintenance":
    case "equipment_transfers":
      return { kind: model.kind, from: model.params.from, to: model.params.to };
    // Finance reports (CM-709).
    case "account_ledger":
      return {
        kind: model.kind,
        accountId: model.params.accountId,
        from: model.params.from,
        to: model.params.to,
        categoryId: model.params.categoryId ?? null,
        mode: model.params.mode ?? null,
        module: model.params.module ?? null,
        counterpartyKind: model.params.counterpartyKind ?? null,
      };
    case "petty_cash":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        accountId: model.params.accountId ?? null,
        accountIds: pettyCashAccounts,
      };
    case "transactions":
    case "other_expenses":
      return { kind: model.kind, from: model.params.from, to: model.params.to };
    case "contractor_payments":
    case "supplier_payments":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        partyId: model.params.partyId ?? null,
      };
    case "tds_194c":
      return {
        kind: model.kind,
        fy: model.params.fy,
        contractorId: model.params.contractorId ?? null,
        projectIds,
      };
    case "due_payments":
      return { kind: model.kind, asOn: model.params.asOn, projectIds };
    // Tracking reports (CM-805).
    case "task_report":
    case "issue_snag_report":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        own,
      };
    case "inspection_request_report":
      return { kind: model.kind, from: model.params.from, to: model.params.to };
  }
}

/**
 * The Session for a request, checked for `report` on the kind's menu and
 * Project; the Ledger's menu depends on its account (`ledgerRefusal`).
 */
async function sessionFor(
  request: Request,
  model: RequestConstructionReportingReportRequestModel,
): Promise<AccessSession | Response> {
  if (model.kind === "account_ledger") {
    const session = await requireReportSession(request);
    if (isResponse(session)) return session;
    return (await ledgerRefusal(session, model.params.accountId)) ?? session;
  }
  return requireAccess(
    request,
    REPORT_MENU[model.kind],
    "report",
    model.projectId == null ? {} : { projectId: model.projectId },
  );
}

/**
 * Requests a report (CM-217, CM-218, CM-605, CM-608): the job is queued
 * and, until M9's queue, run inline, so the response is usually `done`
 * with download links (or `failed` with a message). Needs `report` on the
 * kind's menu (`REPORT_MENU`) and Project; the payment report and the
 * muster roll are about money and are refused without Financial. Other
 * reports print amounts only with it. Finance reports (CM-709) need only
 * Report on their finance menu; the Ledger checks its account's menu, and
 * Petty Cash covers only the requester's account without View all.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const model = parseOrThrow(
      RequestConstructionReportingReportRequestModel.safeParse(
        await request.json(),
      ),
    );
    const session = await sessionFor(request, model);
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
    // Petty Cash: the accounts the requester may see, fixed with the job.
    let pettyCashAccounts: string[] | null = null;
    if (model.kind === "petty_cash") {
      pettyCashAccounts = await pettyCashAccountScope(session);
      const picked = model.params.accountId;
      if (
        picked != null &&
        pettyCashAccounts != null &&
        !pettyCashAccounts.includes(picked)
      )
        return jsonError(
          StatusCodes.NOT_FOUND,
          "PETTY_CASH_ACCOUNT_NOT_FOUND",
          "There is no such petty-cash account.",
        );
    }
    // Task and Issue & Snag reports: without View all, own rows only.
    const own =
      model.kind === "task_report" || model.kind === "issue_snag_report"
        ? await trackingOwnScope(session, model.kind, model.projectId)
        : null;
    const job = await reports.request({
      workspaceId: session.workspaceId,
      userId: session.userId,
      projectId: model.projectId,
      params: paramsOf(model, projectIds, pettyCashAccounts, own),
      includesMoney: financial && printsAmounts(model.kind),
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
      items: jobs
        .filter((job) => mayOpen(session, job))
        .map(toReportJobResponse),
    };
    return Response.json(body);
  } catch (error) {
    return mapError(error);
  }
}
