import type { FinanceAccessMenu } from "@/app/api/construction/finance/access/access-models";
import type { ReportJob, RequestReportInput } from "@/src/queries/reports";

export type ReportDefinition = {
  /** The kinds this page requests; the DPR has its own module (CM-606). */
  kind: RequestReportInput["kind"];
  title: string;
  description: string;
  /**
   * A date range, one month, one day the balances are taken on, or a
   * financial year.
   */
  period: "range" | "month" | "as_on" | "fy";
  /** Shown under the description: what the report needs. */
  needs: string;
  /** An optional filter the card offers when it has options for it. */
  filter?: "contractor" | "equipment" | "supplier" | "account";
  /** The filter must be picked (the Ledger's account); no "All". */
  filterRequired?: boolean;
  /**
   * Finance reports (CM-709): the menu whose Report flag shows the card.
   * The Ledger's card shows with either of its menus.
   */
  menus?: readonly FinanceAccessMenu[];
};

/** The Project's reports (CM-217, CM-218), in the order the page shows them. */
export const REPORT_CATALOGUE: readonly ReportDefinition[] = [
  {
    kind: "labour_attendance",
    title: "All Labour Attendance",
    description:
      "Every Labour's days in the period: present, half day, absent, leave, paid leave, holiday and overtime hours, with a day-by-day list.",
    period: "range",
    needs: "Needs Labour Report.",
  },
  {
    kind: "labour_payment",
    title: "All Labour Payment",
    description:
      "Previous Balance, To Pay, Advance, Paid and Final Amount for each Labour, from the ledger.",
    period: "range",
    needs: "Needs Labour Report and Financial.",
  },
  {
    kind: "labour_month",
    title: "Month-wise Labour",
    description:
      "Labour × day grid for a month (P, ½, A, L, PL, H) with totals; wages earned with Financial.",
    period: "month",
    needs: "Needs Labour Report.",
  },
  {
    kind: "vendor_attendance",
    title: "Vendor Attendance",
    description:
      "Each vendor's full days, half days and overtime by shift and Labour Category; rates and pay with Vendor Financial.",
    period: "range",
    needs: "Needs Vendor Report.",
  },
  {
    kind: "muster_roll",
    title: "Muster roll and wage register",
    description:
      "The combined register of workmen, muster roll and wages for a month: father's name, days, wage rate, overtime, gross, deductions, net and a signature column.",
    period: "month",
    needs: "Needs Labour Report and Financial.",
  },
];

/**
 * The Project's site-work reports (CM-605, CM-608), in their own group on
 * the Reports page.
 */
export const SITE_WORK_REPORT_CATALOGUE: readonly ReportDefinition[] = [
  {
    kind: "daily_work",
    title: "Daily Work",
    description:
      "Every worksheet in the period: contractor, department, skilled and unskilled labour, location, work done, shift, photos and consumed material.",
    period: "range",
    needs: "Needs Daily Worksheet Report.",
    filter: "contractor",
  },
  {
    kind: "owned_equipment_usage",
    title: "Company Owned Equipment Usage",
    description:
      "Usage sheets of owned equipment: operator, hours, km or trips, idle and breakdown hours, fuel and overruns, with totals per machine.",
    period: "range",
    needs: "Needs Equipment Usage Report.",
    filter: "equipment",
  },
  {
    kind: "rented_equipment_usage",
    title: "Rented Equipment Usage",
    description:
      "Usage sheets of hired equipment with the hire party, basis and billable quantity; unit rate and hire cost with Financial.",
    period: "range",
    needs: "Needs Equipment Usage Report; hire cost needs Financial.",
    filter: "equipment",
  },
  {
    kind: "equipment_maintenance",
    title: "Equipment Maintenance",
    description:
      "Maintenance of machines that were at this Project when it started: kind, dates, days, workshop; cost with Financial.",
    period: "range",
    needs: "Needs Equipments Report; cost needs Financial.",
  },
  {
    kind: "equipment_transfers",
    title: "Equipment Transfers",
    description:
      "Transfers out of or into this Project: location before, destination, latest location, remarks and who entered them.",
    period: "range",
    needs: "Needs Equipments Report.",
  },
];

/**
 * The Project's finance reports (CM-709, ADR CM-0017 §16), each shown by
 * the viewer's Report flag on its finance menu.
 */
export const FINANCE_REPORT_CATALOGUE: readonly ReportDefinition[] = [
  {
    kind: "transactions",
    title: "Transactions",
    description:
      "Transactions and transfers on this Project in the period: type, account, category, mode, reference, Paid To / Received From, amount and status.",
    period: "range",
    needs: "Needs Transactions Report.",
    menus: ["finance.transactions"],
  },
  {
    kind: "petty_cash",
    title: "Petty Cash",
    description:
      "Vouchers on this Project: date, number, type, category, account, Paid To / Received From, credit, debit and status, with each account's closing balance.",
    period: "range",
    needs: "Needs Petty Cash Report; other holders' accounts need View all.",
    filter: "account",
    menus: ["finance.petty_cash"],
  },
  {
    kind: "contractor_payments",
    title: "Contractor Payments",
    description:
      "Per Contractor: opening, invoiced, paid, TDS, written off and closing balance; every invoice with what settled it and every payment.",
    period: "range",
    needs: "Needs Parties Report.",
    filter: "contractor",
    menus: ["finance.parties"],
  },
  {
    kind: "supplier_payments",
    title: "Supplier Payments",
    description:
      "Per Supplier: opening, invoiced, paid, written off and closing balance; every invoice with what settled it and every payment.",
    period: "range",
    needs: "Needs Parties Report.",
    filter: "supplier",
    menus: ["finance.parties"],
  },
  {
    kind: "other_expenses",
    title: "Other Expenses",
    description:
      "This Project's Other Expenses in the period: category, payee, account, mode, reference, amount and status.",
    period: "range",
    needs: "Needs Other Expenses Report.",
    menus: ["finance.other_expenses"],
  },
  {
    kind: "due_payments",
    title: "Due Payments",
    description:
      "Per party with open invoices on this Project: invoiced, paid, due and the due by days past the due date (not due, 0–30, 31–60, 61–90, 90+).",
    period: "as_on",
    needs: "Needs Parties Report.",
    menus: ["finance.parties"],
  },
];

/** The Company-wide finance reports of Central Payment (CM-709). */
export const CENTRAL_FINANCE_REPORT_CATALOGUE: readonly ReportDefinition[] = [
  {
    kind: "account_ledger",
    title: "Ledger",
    description:
      "One account's opening balance, every entry in the period with its running balance, credit, debit and the closing balance.",
    period: "range",
    needs:
      "Needs Company's Bank A/C Report, or Petty Cash Report for a petty-cash account.",
    filter: "account",
    filterRequired: true,
    menus: ["masters.bank_accounts", "finance.petty_cash"],
  },
  {
    kind: "tds_194c",
    title: "TDS 194C",
    description:
      "Each Contractor's payments of the financial year with base, rate, TDS and overrides, and the totals by quarter for filing. PANs show the last four characters.",
    period: "fy",
    needs: "Needs Parties Report; a member sees the Projects they are on.",
    filter: "contractor",
    menus: ["finance.parties"],
  },
  {
    kind: "due_payments",
    title: "Due Payments",
    description:
      "Every party's open invoices across Projects: invoiced, paid, due and the ageing by days past the due date; receivables of Other Parties apart.",
    period: "as_on",
    needs: "Needs Parties Report; a member sees the Projects they are on.",
    menus: ["finance.parties"],
  },
];

/** The central equipment reports of Masters → Equipments (CM-605). */
export const EQUIPMENT_REPORT_CATALOGUE: readonly ReportDefinition[] = [
  {
    kind: "equipment_maintenance",
    title: "Equipment Maintenance",
    description:
      "Maintenance of every machine in the period, with the Project it was at: kind, dates, days, workshop; cost with Financial.",
    period: "range",
    needs: "Needs Equipments Report; cost needs Financial.",
  },
  {
    kind: "equipment_transfers",
    title: "Equipment Transfers",
    description:
      "Every transfer to a Project or the warehouse in the period: location before, destination, latest location, remarks and who entered them.",
    period: "range",
    needs: "Needs Equipments Report.",
  },
];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `2026-09-01` → `01 Sep 2026`. */
export function dateLabel(date: string): string {
  const [year = "", month = "", day = ""] = date.split("-");
  return `${day} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

/** `2026-09` → `September 2026`. */
export function monthLabel(month: string): string {
  const [year = "", index = ""] = month.split("-");
  return `${LONG_MONTHS[Number(index) - 1] ?? ""} ${year}`;
}

/** What a job covers, as the list shows it. */
export function jobPeriod(job: ReportJob): string {
  const { month, from, to, fy, asOn } = job.params;
  if (month != null) return monthLabel(month);
  if (fy != null) return `FY ${fy}`;
  if (asOn != null) return `As on ${dateLabel(asOn)}`;
  if (from == null || to == null) return "";
  return from === to
    ? dateLabel(from)
    : `${dateLabel(from)} – ${dateLabel(to)}`;
}

/** The first day of `today`'s month. */
export function monthStart(today: string): string {
  return `${today.slice(0, 7)}-01`;
}

/** Today on this device, `YYYY-MM-DD`. */
export function deviceToday(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The financial year `today` falls in, `2026-27`. */
export function financialYearOf(today: string): string {
  const year = Number(today.slice(0, 4));
  const start = Number(today.slice(5, 7)) >= 4 ? year : year - 1;
  return `${String(start)}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** This financial year and the three before it, newest first. */
export function recentFinancialYears(today: string): string[] {
  const start = Number(financialYearOf(today).slice(0, 4));
  return [0, 1, 2, 3].map((back) => {
    const year = start - back;
    return `${String(year)}-${String((year + 1) % 100).padStart(2, "0")}`;
  });
}
