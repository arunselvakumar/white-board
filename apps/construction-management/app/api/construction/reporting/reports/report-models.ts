import { z } from "zod";

import {
  REPORT_KINDS,
  REPORT_TITLES,
  type ReportJob,
} from "@/src/reporting/domain/report-job";

export const REPORTS_PATH = "/api/construction/reporting/reports";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const DateRangeParams = z.object({
  /** `YYYY-MM-DD`; at most 366 days to `to`. */
  from: z.iso.date(),
  to: z.iso.date(),
});

const MonthParams = z.object({
  /** `YYYY-MM`. */
  month: z.string().regex(MONTH_RE, "Use YYYY-MM."),
});

const FY_RE = /^\d{4}-\d{2}$/;

const PAYMENT_MODES = ["cash", "cheque", "online", "upi"] as const;
const LEDGER_MODULES = [
  "account",
  "transaction",
  "account_transfer",
  "petty_cash_voucher",
  "other_expense",
  "party_payment",
  "wage_payment",
  "salary_slip",
] as const;
const COUNTERPARTY_KINDS = [
  "contractor",
  "supplier",
  "other_party",
  "labour",
  "vendor",
  "team_member",
] as const;

const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
const TRANSFER_STATUSES = [
  "pending",
  "in_transit",
  "delivered",
  "rejected",
] as const;
const TRANSFER_TYPES = [
  "project_to_project",
  "project_to_store",
  "store_to_project",
  "store_to_store",
] as const;

/**
 * Central only (CM-903): the Projects to cover, among those you may see;
 * left out for every one. Chosen Projects leave the Central Stores out.
 */
const ProjectIdsParam = z.array(z.uuid()).min(1).max(500).optional();

// Requests

/**
 * One request per kind. Labour reports need Labour (`labour.labour`)
 * Report on the Project, the vendor report Vendor (`labour.vendor`)
 * Report; the payment report and the muster roll also need Financial.
 * Site work: Daily Work needs Daily Worksheet Report, the usage reports
 * Equipment Usage Report (hire cost with its Financial), maintenance and
 * transfers Equipments Report (maintenance cost with its Financial).
 * Tracking: Task Report needs Task Report (prices with Task Financial),
 * Issue & Snag Report Issues and snags Report, Inspection Request Report
 * Inspection Request Report.
 */
export const RequestConstructionReportingReportRequestModel =
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("labour_attendance"),
      projectId: z.uuid(),
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("labour_payment"),
      projectId: z.uuid(),
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("labour_month"),
      projectId: z.uuid(),
      params: MonthParams,
    }),
    z.object({
      kind: z.literal("vendor_attendance"),
      /** Null for the Central Vendor Attendance Report (every Project the requester may see). */
      projectId: z.uuid().nullable(),
      params: DateRangeParams.extend({
        vendorId: z.uuid().optional(),
        /** A Labour Category. */
        categoryId: z.uuid().optional(),
        projectIds: ProjectIdsParam,
      }),
    }),
    z.object({
      kind: z.literal("muster_roll"),
      projectId: z.uuid(),
      params: MonthParams,
    }),
    // Site work reports (CM-605, CM-608).
    z.object({
      kind: z.literal("daily_work"),
      projectId: z.uuid(),
      params: DateRangeParams.extend({ contractorId: z.uuid().optional() }),
    }),
    z.object({
      kind: z.literal("owned_equipment_usage"),
      projectId: z.uuid(),
      params: DateRangeParams.extend({ equipmentId: z.uuid().optional() }),
    }),
    z.object({
      kind: z.literal("rented_equipment_usage"),
      projectId: z.uuid(),
      params: DateRangeParams.extend({ equipmentId: z.uuid().optional() }),
    }),
    z.object({
      kind: z.literal("equipment_maintenance"),
      /** Null for the central report of Masters → Equipments (every machine). */
      projectId: z.uuid().nullable(),
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("equipment_transfers"),
      /** Null for the central report of Masters → Equipments (every machine). */
      projectId: z.uuid().nullable(),
      params: DateRangeParams,
    }),
    // Finance reports (CM-709). Finance menus have no Financial flag:
    // Report on the menu is enough (ADR CM-0017 §14).
    z.object({
      kind: z.literal("account_ledger"),
      /** Always central. A company account needs Company's Bank A/C Report; a petty-cash account Petty Cash Report (and View all unless it is yours). */
      projectId: z.null(),
      params: DateRangeParams.extend({
        accountId: z.uuid(),
        categoryId: z.uuid().optional(),
        mode: z.enum(PAYMENT_MODES).optional(),
        /** The module that wrote the entry. */
        module: z.enum(LEDGER_MODULES).optional(),
        /** Paid To / Received From kind. */
        counterpartyKind: z.enum(COUNTERPARTY_KINDS).optional(),
      }),
    }),
    z.object({
      kind: z.literal("petty_cash"),
      projectId: z.uuid(),
      /** Petty Cash Report; without View all only your own account. */
      params: DateRangeParams.extend({ accountId: z.uuid().optional() }),
    }),
    z.object({
      kind: z.literal("transactions"),
      projectId: z.uuid(),
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("contractor_payments"),
      projectId: z.uuid(),
      params: DateRangeParams.extend({ partyId: z.uuid().optional() }),
    }),
    z.object({
      kind: z.literal("supplier_payments"),
      projectId: z.uuid(),
      params: DateRangeParams.extend({ partyId: z.uuid().optional() }),
    }),
    z.object({
      kind: z.literal("other_expenses"),
      projectId: z.uuid(),
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("tds_194c"),
      /** Always central: the Owner's covers every Project, a member's the Projects they are on. */
      projectId: z.null(),
      params: z.object({
        /** Financial year, `2026-27`. */
        fy: z.string().regex(FY_RE, "Use a financial year as 2026-27."),
        contractorId: z.uuid().optional(),
      }),
    }),
    z.object({
      kind: z.literal("due_payments"),
      /** Null for the central report (Central Payment). */
      projectId: z.uuid().nullable(),
      params: z.object({ asOn: z.iso.date() }),
    }),
    // Tracking reports (CM-805, ADR CM-0019 §14). Without View all a Task
    // or Issue & Snag report covers your own and assigned rows only.
    z.object({
      kind: z.literal("task_report"),
      projectId: z.uuid(),
      /** Tasks added in the period; prices need Task Financial. */
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("issue_snag_report"),
      projectId: z.uuid(),
      /** Issues with an Issue Date in the period. */
      params: DateRangeParams,
    }),
    z.object({
      kind: z.literal("inspection_request_report"),
      projectId: z.uuid(),
      /** Requests with an Inspection Date in the period. */
      params: DateRangeParams,
    }),
    // Procurement and central labour reports (CM-903, ADR CM-0021 §5).
    // Null `projectId` is the central report (Central Reports), which
    // also needs Central Reports Read.
    z.object({
      kind: z.literal("purchase_requests"),
      projectId: z.uuid().nullable(),
      /** Requests with a Request Date in the period; Purchase Request Report. */
      params: DateRangeParams.extend({
        status: z.enum(APPROVAL_STATUSES).optional(),
        materialCategoryId: z.uuid().optional(),
        materialId: z.uuid().optional(),
        /** A User id (Created By). */
        createdBy: z.string().min(1).max(100).optional(),
        projectIds: ProjectIdsParam,
      }),
    }),
    z.object({
      kind: z.literal("purchase_orders"),
      projectId: z.uuid().nullable(),
      /** Orders with a PO Date in the period; Purchase Order Report. */
      params: DateRangeParams.extend({
        status: z.enum(APPROVAL_STATUSES).optional(),
        supplierId: z.uuid().optional(),
        projectIds: ProjectIdsParam,
      }),
    }),
    z.object({
      kind: z.literal("material_received"),
      projectId: z.uuid().nullable(),
      /** Receipts with a GR Date in the period; amounts need Material Received Financial, others' receipts View all. */
      params: DateRangeParams.extend({
        supplierId: z.uuid().optional(),
        projectIds: ProjectIdsParam,
      }),
    }),
    z.object({
      kind: z.literal("material_transfers"),
      projectId: z.uuid().nullable(),
      /** Transfers with a Transfer Date in the period; Material Transfer Report. */
      params: DateRangeParams.extend({
        status: z.enum(TRANSFER_STATUSES).optional(),
        transferType: z.enum(TRANSFER_TYPES).optional(),
        projectIds: ProjectIdsParam,
      }),
    }),
    z.object({
      kind: z.literal("stock_register"),
      projectId: z.uuid().nullable(),
      /** Current Inventory Report; a Store needs Central store Read. */
      params: DateRangeParams.extend({
        materialCategoryId: z.uuid().optional(),
        materialId: z.uuid().optional(),
        /** Central only: this Central Store (with any chosen Projects). */
        storeId: z.uuid().optional(),
        projectIds: ProjectIdsParam,
      }),
    }),
    z.object({
      kind: z.literal("labour_attendance_central"),
      /** Always central: every Project you may see, or the chosen ones. */
      projectId: z.null(),
      params: DateRangeParams.extend({ projectIds: ProjectIdsParam }),
    }),
  ]);

export type RequestConstructionReportingReportRequestModel = z.infer<
  typeof RequestConstructionReportingReportRequestModel
>;

export const ListConstructionReportingReportsRequestModel = z.object({
  /** Leave out for your own central reports. */
  projectId: z.uuid().optional(),
});

export const ConstructionReportingReportParamsModel = z.object({
  id: z.uuid(),
});

export const DownloadConstructionReportingReportRequestModel = z.object({
  format: z.enum(["xlsx", "pdf"]),
});

// Responses

export const ConstructionReportingReportJobResponseModel = z.object({
  id: z.uuid(),
  kind: z.enum(REPORT_KINDS),
  title: z.string(),
  /** Null for a central report. */
  projectId: z.uuid().nullable(),
  params: z.object({
    from: z.string().optional(),
    to: z.string().optional(),
    month: z.string().optional(),
    vendorId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    contractorId: z.string().nullable().optional(),
    equipmentId: z.string().nullable().optional(),
    /** Finance reports (CM-709). */
    accountId: z.string().nullable().optional(),
    mode: z.string().nullable().optional(),
    module: z.string().nullable().optional(),
    counterpartyKind: z.string().nullable().optional(),
    partyId: z.string().nullable().optional(),
    fy: z.string().optional(),
    asOn: z.string().optional(),
    /** Daily Progress Report: its date and number. */
    date: z.string().optional(),
    number: z.string().optional(),
    /** Procurement reports (CM-903). */
    status: z.string().nullable().optional(),
    supplierId: z.string().nullable().optional(),
    materialId: z.string().nullable().optional(),
    materialCategoryId: z.string().nullable().optional(),
    createdBy: z.string().nullable().optional(),
    transferType: z.string().nullable().optional(),
    storeId: z.string().nullable().optional(),
    /** The Projects the requester chose for a central report. */
    projectIds: z.array(z.string()).optional(),
  }),
  status: z.enum(["queued", "running", "done", "failed", "expired"]),
  /** The files carry amounts; downloading them needs Financial. */
  includesMoney: z.boolean(),
  /** Why a failed report failed. */
  error: z.string().nullable(),
  requestedBy: z.string(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  /** Download links once the report is done. */
  downloads: z.object({
    xlsx: z.string().nullable(),
    pdf: z.string().nullable(),
  }),
});

export type ConstructionReportingReportJobResponseModel = z.infer<
  typeof ConstructionReportingReportJobResponseModel
>;

export const ListConstructionReportingReportsResponseModel = z.object({
  items: z.array(ConstructionReportingReportJobResponseModel),
});

export type ListConstructionReportingReportsResponseModel = z.infer<
  typeof ListConstructionReportingReportsResponseModel
>;

export function downloadPath(id: string, format: "xlsx" | "pdf"): string {
  return `${REPORTS_PATH}/${id}/download?format=${format}`;
}

/** The Projects a central report was asked for, when they were chosen. */
function chosenProjects(params: {
  projectIds: string[] | null;
  projectsChosen: boolean;
}): { projectIds?: string[] } {
  return params.projectsChosen && params.projectIds != null
    ? { projectIds: params.projectIds }
    : {};
}

function responseParams(
  params: ReportJob["params"],
): ConstructionReportingReportJobResponseModel["params"] {
  switch (params.kind) {
    case "labour_month":
    case "muster_roll":
      return { month: params.month };
    case "vendor_attendance":
      return {
        from: params.from,
        to: params.to,
        vendorId: params.vendorId,
        categoryId: params.labourCategoryId,
      };
    // Site work reports (CM-605, CM-608).
    case "daily_work":
      return {
        from: params.from,
        to: params.to,
        contractorId: params.contractorId,
      };
    case "owned_equipment_usage":
    case "rented_equipment_usage":
      return {
        from: params.from,
        to: params.to,
        equipmentId: params.equipmentId,
      };
    case "daily_progress_report":
      return { date: params.date, number: params.number };
    // Finance reports (CM-709).
    case "account_ledger":
      return {
        from: params.from,
        to: params.to,
        accountId: params.accountId,
        categoryId: params.categoryId,
        mode: params.mode,
        module: params.module,
        counterpartyKind: params.counterpartyKind,
      };
    case "petty_cash":
      return { from: params.from, to: params.to, accountId: params.accountId };
    case "contractor_payments":
    case "supplier_payments":
      return { from: params.from, to: params.to, partyId: params.partyId };
    case "tds_194c":
      return { fy: params.fy, contractorId: params.contractorId };
    case "due_payments":
      return { asOn: params.asOn };
    // Procurement and central labour reports (CM-903).
    case "purchase_requests":
      return {
        from: params.from,
        to: params.to,
        status: params.status,
        materialCategoryId: params.categoryId,
        materialId: params.materialId,
        createdBy: params.createdBy,
        ...chosenProjects(params),
      };
    case "purchase_orders":
      return {
        from: params.from,
        to: params.to,
        status: params.status,
        supplierId: params.supplierId,
        ...chosenProjects(params),
      };
    case "material_received":
      return {
        from: params.from,
        to: params.to,
        supplierId: params.supplierId,
        ...chosenProjects(params),
      };
    case "material_transfers":
      return {
        from: params.from,
        to: params.to,
        status: params.status,
        transferType: params.transferType,
        ...chosenProjects(params),
      };
    case "stock_register":
      return {
        from: params.from,
        to: params.to,
        materialCategoryId: params.categoryId,
        materialId: params.materialId,
        storeId:
          params.storeIds?.length === 1 ? (params.storeIds[0] ?? null) : null,
        ...chosenProjects(params),
      };
    case "labour_attendance_central":
      return { from: params.from, to: params.to, ...chosenProjects(params) };
    default:
      return { from: params.from, to: params.to };
  }
}

export function toReportJobResponse(
  job: ReportJob,
): ConstructionReportingReportJobResponseModel {
  const done = job.status === "done";
  return {
    id: job.id,
    kind: job.kind,
    title: REPORT_TITLES[job.kind],
    projectId: job.projectId,
    params: responseParams(job.params),
    status: job.status,
    includesMoney: job.includesMoney,
    error: job.error,
    requestedBy: job.requestedBy,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    downloads: {
      xlsx: done && job.xlsxKey != null ? downloadPath(job.id, "xlsx") : null,
      pdf: done && job.pdfKey != null ? downloadPath(job.id, "pdf") : null,
    },
  };
}
