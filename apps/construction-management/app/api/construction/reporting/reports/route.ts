import { StatusCodes } from "http-status-codes";

import { mapError, parseOrThrow } from "@/app/api/_lib/map-error";
import { jsonError } from "@/app/api/_lib/json-error";
import {
  requireAccess,
  type AccessSession,
} from "@/app/api/_lib/require-access";
import { isResponse } from "@/app/api/_lib/require-session";
import { reportNotAvailable } from "@/src/reporting/application/report-handlers";
import {
  isMoneyReport,
  isReportAvailable,
  printsAmounts,
  REPORT_KINDS,
  type ReportKind,
  type ReportOwnScope,
  type ReportParams,
} from "@/src/reporting/domain/report-job";

import { can } from "@/src/shared-kernel/access";

import {
  canReport,
  canSeeMoney,
  ledgerRefusal,
  mayOpen,
  pettyCashAccountScope,
  permissionDenied,
  REPORT_MENU,
  reportableKinds,
  reports,
  requireReportSession,
  inquiryOwnScope,
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

function unavailableKind(body: unknown): ReportKind | null {
  const kind =
    typeof body === "object" && body != null && "kind" in body
      ? body.kind
      : null;
  const known = REPORT_KINDS.find((item) => item === kind);
  return known == null || isReportAvailable(known) ? null : known;
}

/** Where a request reads, fixed with the job (central reports, CM-903). */
type Scope = {
  /** The Projects (null: every Project of the Company). */
  projectIds: string[] | null;
  /** The Central Stores (null: every Store; empty: none). */
  storeIds: string[] | null;
  /** The requester chose the Projects. */
  projectsChosen: boolean;
  /** Material Received without View all: only this User's receipts. */
  ownBy: string | null;
};

function paramsOf(
  model: RequestConstructionReportingReportRequestModel,
  scope: Scope,
  pettyCashAccounts: string[] | null,
  own: ReportOwnScope | null,
): ReportParams {
  const { projectIds } = scope;
  const places = {
    projectIds: scope.projectIds,
    storeIds: scope.storeIds,
    projectsChosen: scope.projectsChosen,
  };
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
    // Procurement and central labour reports (CM-903).
    case "purchase_requests":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        status: model.params.status ?? null,
        categoryId: model.params.materialCategoryId ?? null,
        materialId: model.params.materialId ?? null,
        createdBy: model.params.createdBy ?? null,
        ...places,
      };
    case "purchase_orders":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        status: model.params.status ?? null,
        supplierId: model.params.supplierId ?? null,
        ...places,
      };
    case "material_received":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        supplierId: model.params.supplierId ?? null,
        ownBy: scope.ownBy,
        ...places,
      };
    case "material_transfers":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        status: model.params.status ?? null,
        transferType: model.params.transferType ?? null,
        ...places,
      };
    case "stock_register":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        categoryId: model.params.materialCategoryId ?? null,
        materialId: model.params.materialId ?? null,
        ...places,
      };
    case "labour_attendance_central":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        projectIds,
        projectsChosen: scope.projectsChosen,
      };
    // Sales reports (CM-1008).
    case "inquiry_report":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        interestType: model.params.interestType ?? null,
        leadSourceId: model.params.leadSourceId ?? null,
        funnelStageId: model.params.funnelStageId ?? null,
        status: model.params.status ?? null,
        lostReasonId: model.params.lostReasonId ?? null,
        assigneeMemberId: model.params.assigneeMemberId ?? null,
        own,
      };
    case "booking_report":
      return {
        kind: model.kind,
        from: model.params.from,
        to: model.params.to,
        status: model.params.status ?? null,
        wingId: model.params.wingId ?? null,
      };
  }
}

/** The Projects the request chose (central only), when it takes the filter. */
function chosenProjectIds(
  model: RequestConstructionReportingReportRequestModel,
): string[] | null {
  if (model.projectId != null || !("projectIds" in model.params)) return null;
  const ids = model.params.projectIds;
  return ids == null ? null : [...new Set(ids)];
}

/**
 * Whether a central report of this kind reads the Central Stores: Purchase
 * Orders and Material Received on a Store follow their own Company-level
 * menu (CM-0015); a Store's transfers and stock also need Central store
 * Read (`canOnTransferSide`, `canAtLocation`).
 */
function readsStores(
  session: AccessSession,
  kind: RequestConstructionReportingReportRequestModel["kind"],
): boolean {
  switch (kind) {
    case "purchase_orders":
    case "material_received":
      return true;
    case "material_transfers":
    case "stock_register":
      return can(session.access, "procurement.central_store", "read");
    default:
      return false;
  }
}

/**
 * Where the request reads (CM-903). A Project's report reads the Project.
 * A central one reads the Projects the requester may see now (every one
 * for the Owner) or the chosen ones among them, and, unless Projects were
 * chosen, the Central Stores the kind reads; the Stock Register's Store
 * filter reads that Store (with any chosen Projects).
 */
function scopeOf(
  session: AccessSession,
  model: RequestConstructionReportingReportRequestModel,
): Scope | Response {
  const visible =
    session.role === "owner" ? null : [...session.access.projectIds];
  const chosen = chosenProjectIds(model);
  let projectIds =
    model.projectId != null
      ? null
      : chosen == null
        ? visible
        : visible == null
          ? chosen
          : chosen.filter((id) => visible.includes(id));
  const stores = model.projectId == null && readsStores(session, model.kind);
  const storeId =
    model.kind === "stock_register" && model.projectId == null
      ? (model.params.storeId ?? null)
      : null;
  if (storeId != null && !stores)
    return permissionDenied(
      "A Store's stock needs Central store Read. Ask the Owner to change your Permission Matrix.",
    );
  let storeIds: string[] | null = !stores
    ? []
    : storeId != null
      ? [storeId]
      : chosen != null
        ? []
        : null;
  // A Store picked alone reads that Store only.
  if (storeId != null && chosen == null) projectIds = [];
  if (model.projectId != null) storeIds = [];
  // Without View all on Material Received: the requester's own receipts.
  const ownBy =
    model.kind === "material_received" &&
    !can(
      session.access,
      "procurement.material_received",
      "view_all",
      model.projectId == null ? {} : { projectId: model.projectId },
    )
      ? session.userId
      : null;
  return { projectIds, storeIds, projectsChosen: chosen != null, ownBy };
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
    const body: unknown = await request.json();
    // A catalogued kind whose builder is not there yet (CM-903) is 409,
    // before its params are checked.
    const unavailable = unavailableKind(body);
    if (unavailable != null) throw reportNotAvailable(unavailable);
    const model = parseOrThrow(
      RequestConstructionReportingReportRequestModel.safeParse(body),
    );
    const session = await sessionFor(request, model);
    if (isResponse(session)) return session;
    // A central report also needs Central Reports Read unless a module
    // hosts it (Central Payment, Masters → Equipments; CM-903).
    if (model.projectId == null && !canReport(session.access, model.kind, null))
      return permissionDenied(
        "Central reports need Central Reports Read. Ask the Owner to change your Permission Matrix.",
      );
    const financial = canSeeMoney(session.access, model.kind, model.projectId);
    if (isMoneyReport(model.kind) && !financial)
      return permissionDenied(
        "This report is about amounts: it needs Financial on Labour. Ask the Owner to change your Permission Matrix.",
      );
    // A central report covers the Projects the requester may see now.
    const scope = scopeOf(session, model);
    if (isResponse(scope)) return scope;
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
    // Task, Issue & Snag and Inquiry reports: without View all, own rows only.
    const own =
      model.kind === "task_report" || model.kind === "issue_snag_report"
        ? await trackingOwnScope(session, model.kind, model.projectId)
        : model.kind === "inquiry_report"
          ? await inquiryOwnScope(session, model.projectId)
          : null;
    const job = await reports.request({
      workspaceId: session.workspaceId,
      userId: session.userId,
      projectId: model.projectId,
      params: paramsOf(model, scope, pettyCashAccounts, own),
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
