import { assertCalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

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
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_TITLES: Record<ReportKind, string> = {
  labour_attendance: "All Labour Attendance",
  labour_payment: "All Labour Payment",
  labour_month: "Month-wise Labour",
  vendor_attendance: "Vendor Attendance",
  muster_roll: "Muster roll and wage register",
  // Site work reports (CM-605, CM-606, CM-608).
  daily_progress_report: "Daily Progress Report",
  daily_work: "Daily Work",
  owned_equipment_usage: "Company Owned Equipment Usage",
  rented_equipment_usage: "Rented Equipment Usage",
  equipment_maintenance: "Equipment Maintenance",
  equipment_transfers: "Equipment Transfers",
  // Finance reports (CM-709).
  account_ledger: "Ledger",
  petty_cash: "Petty Cash",
  transactions: "Transactions",
  contractor_payments: "Contractor Payments",
  supplier_payments: "Supplier Payments",
  other_expenses: "Other Expenses",
  tds_194c: "TDS 194C",
  due_payments: "Due Payments",
};

/** The finance reports (CM-709, ADR CM-0017 §16): all about money. */
export const FINANCE_REPORT_KINDS = [
  "account_ledger",
  "petty_cash",
  "transactions",
  "contractor_payments",
  "supplier_payments",
  "other_expenses",
  "tds_194c",
  "due_payments",
] as const satisfies readonly ReportKind[];

export type FinanceReportKind = (typeof FINANCE_REPORT_KINDS)[number];

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
    | null;
};

export type ReportFormat = "xlsx" | "pdf";

/**
 * The files a kind produces. Table reports print an Excel and a PDF of the
 * same document; the Daily Progress Report is a PDF only (CM-0016 §15).
 */
export function reportFormats(kind: ReportKind): readonly ReportFormat[] {
  return kind === "daily_progress_report" ? ["pdf"] : ["xlsx", "pdf"];
}

/**
 * Kinds requested, listed and deleted through their own module rather
 * than the Reports page: the Daily Progress Report lives under the
 * Project's Progress Reports (`/api/construction/site-work/progress-reports`).
 */
export function hasOwnModule(kind: ReportKind): boolean {
  return kind === "daily_progress_report";
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
    };

export type JobStatus = "queued" | "running" | "done" | "failed";

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

/**
 * Kinds that can also be central (no Project on the job): the vendor
 * report, and the equipment reports of Masters → Equipments (CM-605).
 */
export const CENTRAL_REPORT_KINDS: readonly ReportKind[] = [
  "vendor_attendance",
  // Site work reports (CM-605).
  "equipment_maintenance",
  "equipment_transfers",
  // Finance reports (CM-709): the Ledger and TDS 194C are always central.
  "account_ledger",
  "tds_194c",
  "due_payments",
];

/** Kinds that are only central (they never take a Project). */
export const CENTRAL_ONLY_KINDS: readonly ReportKind[] = [
  "account_ledger",
  "tds_194c",
];

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
  return (
    kind === "labour_payment" || kind === "muster_roll" || isFinanceReport(kind)
  );
}

/**
 * Kinds whose files never print an amount, so a job of theirs never needs
 * Financial to download (`includesMoney` stays false).
 */
const AMOUNT_FREE_KINDS: readonly ReportKind[] = [
  "labour_attendance",
  // Site work reports (CM-605, CM-608).
  "daily_work",
  "owned_equipment_usage",
  "equipment_transfers",
];

/** Whether a job of this kind prints amounts when its requester has Financial. */
export function printsAmounts(kind: ReportKind): boolean {
  return !AMOUNT_FREE_KINDS.includes(kind);
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

/** How long a job may run inline before it is stopped (CM-0016 §15). */
export const REPORT_TIME_LIMIT_MS = 60_000;

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
