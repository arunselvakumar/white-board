import type { ReportJob, ReportKind } from "@/src/queries/reports";

export type ReportDefinition = {
  kind: ReportKind;
  title: string;
  description: string;
  /** A date range or one month. */
  period: "range" | "month";
  /** Shown under the description: what the report needs. */
  needs: string;
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
  const { month, from, to } = job.params;
  if (month != null) return monthLabel(month);
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
