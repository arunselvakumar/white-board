import { assertCalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  catalogueEntry,
  catalogueKinds,
  REPORT_CATALOGUE,
  type CatalogueKindsWhere,
} from "./report-catalogue";
import { checkRange, financialYearRange, monthRange } from "./report-period";

/** Every kind of report job (the Prisma enum `report_kind`). */
export const REPORT_KINDS = [
  "labour_attendance",
  "labour_payment",
  "labour_month",
  "vendor_attendance",
  "muster_roll",
  // Site work reports (CM-605, CM-606, CM-608).
  "daily_progress_report",
  "daily_work",
  "owned_equipment_usage",
  "rented_equipment_usage",
  "equipment_maintenance",
  "equipment_transfers",
  // Finance reports (CM-709).
  "account_ledger",
  "petty_cash",
  "transactions",
  "contractor_payments",
  "supplier_payments",
  "other_expenses",
  "tds_194c",
  "due_payments",
  // Tracking reports (CM-805).
  "task_report",
  "issue_snag_report",
  "inspection_request_report",
  "task_progress_report",
  // Procurement and central labour reports (CM-903).
  "purchase_requests",
  "purchase_orders",
  "material_received",
  "material_transfers",
  "stock_register",
  "labour_attendance_central",
  // Sales reports (CM-1008).
  "inquiry_report",
  "booking_report",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

/** Each kind's title, from the catalogue. */
export const REPORT_TITLES = Object.fromEntries(
  REPORT_CATALOGUE.map((entry) => [entry.kind, entry.title]),
) as Record<ReportKind, string>;

/**
 * Who a Task or Issue & Snag report covers without View all (CM-805): the
 * rows the requester created or is assigned to (their Team Member), fixed
 * with the job. Null covers every row (View all or the Owner).
 */
export type ReportOwnScope = { userId: string; memberId: string | null };

/** The finance reports (CM-709, ADR CM-0017 §16): all about money. */
export type FinanceReportKind = CatalogueKindsWhere<{ group: "finance" }>;

export const FINANCE_REPORT_KINDS = catalogueKinds(
  (entry) => entry.group === "finance",
) as readonly FinanceReportKind[];

export function isFinanceReport(kind: ReportKind): kind is FinanceReportKind {
  return (FINANCE_REPORT_KINDS as readonly ReportKind[]).includes(kind);
}

/** The Ledger's optional filters (legacy: category, mode, module, Paid To kind). */
export type LedgerFilters = {
  categoryId: string | null;
  mode: "cash" | "cheque" | "online" | "upi" | null;
  /** The module that wrote the entry (`account_entries.source_type`). */
  module:
    | "account"
    | "transaction"
    | "account_transfer"
    | "petty_cash_voucher"
    | "other_expense"
    | "party_payment"
    | "wage_payment"
    | "salary_slip"
    | null;
  counterpartyKind:
    | "contractor"
    | "supplier"
    | "other_party"
    | "labour"
    | "vendor"
    | "team_member"
    | "client"
    | null;
};

export type ReportFormat = "xlsx" | "pdf";

/** An inquiry's status and interest as the Inquiry Report filters them (CM-0022 §11). */
export type InquiryStatusFilter = "open" | "converted" | "lost";
export type InterestTypeFilter = "hot" | "warm" | "cold";

/** A booking's status as the Booking Report filters it (CM-0022 §7, §11). */
export type BookingStatusFilter =
  "on_hold" | "hold_expired" | "booked" | "cancelled";

/** A procurement document's approval status (Purchase Requests and Orders). */
export type ProcurementApprovalFilter = "pending" | "approved" | "rejected";

/** A Material Transfer's status: pending → in transit → delivered, or rejected. */
export type TransferStatusFilter =
  "pending" | "in_transit" | "delivered" | "rejected";

export type TransferTypeFilter =
  | "project_to_project"
  | "project_to_store"
  | "store_to_project"
  | "store_to_store";

/**
 * Where a central procurement report reads (CM-903), fixed with the job
 * when it is requested: the Projects (null for every Project of the
 * Company: the Owner with none chosen) and the Central Stores (null for
 * every Store, empty for none). Unused on a Project's report.
 */
export type ReportPlaces = {
  projectIds: string[] | null;
  storeIds: string[] | null;
  /** The requester chose the Projects (the card's Projects filter). */
  projectsChosen: boolean;
};

/** The Project's Progress Reports (CM-606, CM-805): PDFs of their own module. */
export type ProgressReportKind = CatalogueKindsWhere<{ progressReport: true }>;

export const PROGRESS_REPORT_KINDS = catalogueKinds(
  (entry) => entry.progressReport,
) as readonly ProgressReportKind[];

export function isProgressReport(kind: ReportKind): kind is ProgressReportKind {
  return catalogueEntry(kind).progressReport;
}

/**
 * The files a kind produces (the catalogue's `formats`). Table reports
 * print an Excel and a PDF of the same document; the Progress Reports are
 * a PDF only.
 */
export function reportFormats(kind: ReportKind): readonly ReportFormat[] {
  return catalogueEntry(kind).formats;
}

/**
 * Kinds requested, listed and deleted through their own module rather
 * than the Reports page: the Progress Reports live under the Project's
 * Progress Reports (`/api/construction/site-work/progress-reports`).
 */
export function hasOwnModule(kind: ReportKind): boolean {
  return isProgressReport(kind);
}

/**
 * Whether the kind's builder exists (the catalogue's `available`):
 * requesting one that does not is 409 `REPORT_NOT_AVAILABLE`.
 */
export function isReportAvailable(kind: ReportKind): boolean {
  return catalogueEntry(kind).available;
}

/** What each kind is filtered by. Dates are `YYYY-MM-DD`, months `YYYY-MM`. */
export type ReportParams =
  | { kind: "labour_attendance"; from: string; to: string }
  | { kind: "labour_payment"; from: string; to: string }
  | { kind: "labour_month"; month: string }
  | {
      kind: "vendor_attendance";
      from: string;
      to: string;
      vendorId: string | null;
      labourCategoryId: string | null;
      /**
       * A central report (no Project on the job): the Projects the
       * requester could see when they asked, fixed with the job; null is
       * every Project of the Company (the Owner). Unused on a Project's
       * report.
       */
      projectIds: string[] | null;
    }
  | { kind: "muster_roll"; month: string }
  | {
      kind: "daily_progress_report";
      /** The report date, `YYYY-MM-DD`. */
      date: string;
      /** User id: only this author's worksheets and usage sheets; null for all. */
      filledBy: string | null;
      /** Photos of the day's worksheets, usage sheets and diary (≤ 60). */
      includeImages: boolean;
      /** The Project's DPR number for the date (`DPR/26-27/00001`). */
      number: string;
    }
  // Site work reports (CM-605, CM-608).
  | {
      kind: "daily_work";
      from: string;
      to: string;
      contractorId: string | null;
    }
  | {
      kind: "owned_equipment_usage" | "rented_equipment_usage";
      from: string;
      to: string;
      equipmentId: string | null;
    }
  /** Central (no Project on the job) covers every Project and the warehouse. */
  | {
      kind: "equipment_maintenance" | "equipment_transfers";
      from: string;
      to: string;
    }
  // Finance reports (CM-709). Central kinds fix the Projects the requester
  // could see when they asked (`projectIds`, null for the Owner: every
  // Project and Store).
  | ({
      kind: "account_ledger";
      accountId: string;
      from: string;
      to: string;
    } & LedgerFilters)
  | {
      kind: "petty_cash";
      from: string;
      to: string;
      /** One account picked on the card; null for every account in scope. */
      accountId: string | null;
      /** The accounts the requester could see (own only without View all); null for all. */
      accountIds: string[] | null;
    }
  | {
      kind: "transactions" | "other_expenses";
      from: string;
      to: string;
    }
  | {
      kind: "contractor_payments" | "supplier_payments";
      from: string;
      to: string;
      partyId: string | null;
    }
  | {
      kind: "tds_194c";
      /** Financial year `2026-27` (1 Apr 2026 to 31 Mar 2027). */
      fy: string;
      contractorId: string | null;
      projectIds: string[] | null;
    }
  | {
      kind: "due_payments";
      /** Balances and ageing on this day, `YYYY-MM-DD`. */
      asOn: string;
      /** Central only; unused on a Project's report. */
      projectIds: string[] | null;
    }
  // Tracking reports (CM-805): tasks by created date, issues by Issue
  // Date, inspections by Inspection Date; the Task Progress Report's
  // progress at the start and end of the period.
  | {
      kind: "task_report";
      from: string;
      to: string;
      /** Without View all: only the requester's own and assigned tasks. */
      own: ReportOwnScope | null;
    }
  | {
      kind: "issue_snag_report";
      from: string;
      to: string;
      /** Without View all: only the requester's own and assigned issues. */
      own: ReportOwnScope | null;
    }
  | { kind: "inspection_request_report"; from: string; to: string }
  | { kind: "task_progress_report"; from: string; to: string }
  // Procurement and central labour reports (CM-903, ADR CM-0021 §5).
  | ({
      kind: "purchase_requests";
      from: string;
      to: string;
      /** Approval status; null for every one. */
      status: ProcurementApprovalFilter | null;
      categoryId: string | null;
      materialId: string | null;
      /** A User id (Created By). */
      createdBy: string | null;
    } & ReportPlaces)
  | ({
      kind: "purchase_orders";
      from: string;
      to: string;
      status: ProcurementApprovalFilter | null;
      supplierId: string | null;
    } & ReportPlaces)
  | ({
      kind: "material_received";
      from: string;
      to: string;
      supplierId: string | null;
      /**
       * Without View all on Material Received: only the receipts this
       * User entered, fixed with the job; null for every one.
       */
      ownBy: string | null;
    } & ReportPlaces)
  | ({
      kind: "material_transfers";
      from: string;
      to: string;
      status: TransferStatusFilter | null;
      transferType: TransferTypeFilter | null;
    } & ReportPlaces)
  | ({
      kind: "stock_register";
      from: string;
      to: string;
      categoryId: string | null;
      materialId: string | null;
    } & ReportPlaces)
  | {
      kind: "labour_attendance_central";
      from: string;
      to: string;
      /** The Projects covered; null for every Project (the Owner). */
      projectIds: string[] | null;
      projectsChosen: boolean;
    }
  // Sales reports (CM-1008, ADR CM-0022 §11).
  | {
      kind: "inquiry_report";
      /** Inquiries with an Inquiry Date in the range. */
      from: string;
      to: string;
      interestType: InterestTypeFilter | null;
      leadSourceId: string | null;
      funnelStageId: string | null;
      status: InquiryStatusFilter | null;
      lostReasonId: string | null;
      /** A Team Member id. */
      assigneeMemberId: string | null;
      /**
       * Without View all: only the inquiries the requester created, is
       * assigned to or owns as Lead Owner (their Team Member).
       */
      own: ReportOwnScope | null;
    }
  | {
      kind: "booking_report";
      /** Bookings with a Booking Date in the range. */
      from: string;
      to: string;
      /** Hold expired is On Hold past Hold until on the Company's today. */
      status: BookingStatusFilter | null;
      wingId: string | null;
    };

/** `expired`: retention deleted its files after 30 days (CM-0021 §3). */
export type JobStatus = "queued" | "running" | "done" | "failed" | "expired";

/** A requested report and, once done, its files (CM-217). */
export type ReportJob = {
  id: string;
  workspaceId: string;
  /** Null for a central report. */
  projectId: string | null;
  kind: ReportKind;
  params: ReportParams;
  status: JobStatus;
  /** The files carry amounts; downloading needs Financial. */
  includesMoney: boolean;
  xlsxKey: string | null;
  pdfKey: string | null;
  fileName: string | null;
  error: string | null;
  requestedBy: string;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

/** Checks the period of a request (≤ 366 days, a real month). */
export function checkReportParams(params: ReportParams): ReportParams {
  switch (params.kind) {
    case "labour_attendance":
    case "labour_payment":
    case "vendor_attendance":
      return { ...params, ...checkRange(params) };
    // Site work reports (CM-605, CM-608).
    case "daily_work":
    case "owned_equipment_usage":
    case "rented_equipment_usage":
    case "equipment_maintenance":
    case "equipment_transfers":
      return { ...params, ...checkRange(params) };
    case "labour_month":
    case "muster_roll":
      monthRange(params.month);
      return params;
    // Finance reports (CM-709).
    case "account_ledger":
    case "petty_cash":
    case "transactions":
    case "other_expenses":
    case "contractor_payments":
    case "supplier_payments":
      return { ...params, ...checkRange(params) };
    case "tds_194c":
      financialYearRange(params.fy);
      return params;
    // Tracking reports (CM-805).
    case "task_report":
    case "issue_snag_report":
    case "inspection_request_report":
    case "task_progress_report":
      return { ...params, ...checkRange(params) };
    // Procurement and central labour reports (CM-903).
    case "purchase_requests":
    case "purchase_orders":
    case "material_received":
    case "material_transfers":
    case "stock_register":
    case "labour_attendance_central":
      return { ...params, ...checkRange(params) };
    // Sales reports (CM-1008).
    case "inquiry_report":
    case "booking_report":
      return { ...params, ...checkRange(params) };
    case "due_payments":
      assertCalendarDate(params.asOn, "REPORT_DATE_INVALID");
      return params;
    case "daily_progress_report":
      assertCalendarDate(params.date, "REPORT_DATE_INVALID");
      if (params.number.trim() === "")
        throw new DomainError(
          "REPORT_NUMBER_REQUIRED",
          "A Daily Progress Report needs its number.",
        );
      return params;
  }
}

/** Kinds that can be central (no Project on the job), from the catalogue. */
export const CENTRAL_REPORT_KINDS = catalogueKinds((entry) =>
  entry.scopes.includes("central"),
);

/** Kinds that are only central (they never take a Project). */
export const CENTRAL_ONLY_KINDS = catalogueKinds(
  (entry) => !entry.scopes.includes("project"),
);

export function canBeCentral(kind: ReportKind): boolean {
  return CENTRAL_REPORT_KINDS.includes(kind);
}

/** Only `CENTRAL_REPORT_KINDS` can be central; the others need a Project. */
export function checkReportScope(
  kind: ReportKind,
  projectId: string | null,
): void {
  if (projectId == null && !canBeCentral(kind))
    throw new DomainError(
      "REPORT_PROJECT_REQUIRED",
      "Choose a Project for this report.",
    );
  if (projectId != null && CENTRAL_ONLY_KINDS.includes(kind))
    throw new DomainError(
      "REPORT_CENTRAL_ONLY",
      "This report covers the whole Company; request it without a Project.",
    );
}

/** Reports that are about money; refused without Financial. */
export function isMoneyReport(kind: ReportKind): boolean {
  return catalogueEntry(kind).money === "always";
}

/**
 * Whether a job of this kind prints amounts when its requester has
 * Financial; a kind that never does never needs Financial to download
 * (`includesMoney` stays false).
 */
export function printsAmounts(kind: ReportKind): boolean {
  return catalogueEntry(kind).money !== "never";
}

/** The download name: `all-labour-attendance-2026-09-01-to-2026-09-30`. */
export function reportFileName(params: ReportParams): string {
  const slug = REPORT_TITLES[params.kind]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  switch (params.kind) {
    case "labour_month":
    case "muster_roll":
      return `${slug}-${params.month}`;
    case "daily_progress_report":
      return `${params.number.replace(/[^A-Za-z0-9._-]+/g, "-")}-${params.date}`;
    case "tds_194c":
      return `${slug}-fy-${params.fy}`;
    case "due_payments":
      return `${slug}-${params.asOn}`;
    default:
      return params.from === params.to
        ? `${slug}-${params.from}`
        : `${slug}-${params.from}-to-${params.to}`;
  }
}

/**
 * A failed job keeps a message a screen can show, never a stack. A domain
 * refusal keeps its own words; anything unexpected (a database or storage
 * error) gets a generic message so internals never reach the screen.
 */
export function failureMessage(error: unknown): string {
  if (error instanceof ReportTimedOut) return error.message;
  if (error instanceof DomainError) return error.message;
  return "The report could not be generated. Try again; if it keeps failing, contact support.";
}

/** How long a report job may run before it is stopped (CM-0021 §1). */
export const REPORT_TIME_LIMIT_MS = 240_000;

/** A job that ran past its time limit; its message is shown on screen. */
export class ReportTimedOut extends Error {
  constructor(limitMs: number) {
    const seconds = Math.max(1, Math.round(limitMs / 1000));
    super(
      `The report took longer than ${String(seconds)} ${seconds === 1 ? "second" : "seconds"} and was stopped. Retry it, or generate it without images.`,
    );
    this.name = "ReportTimedOut";
  }
}
