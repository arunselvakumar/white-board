import type { ReportJob } from "@/src/queries/reports";
import type { ReportCatalogueEntry } from "@/src/queries/report-catalogue";

/**
 * A report card's definition: one entry of the server's report catalogue
 * (`GET /api/construction/reporting/catalogue`, ADR CM-0021 §2), which
 * holds every title, description, period and filter. Nothing about a
 * report is listed in the UI.
 */
export type ReportDefinition = ReportCatalogueEntry;

/** The filters a card can offer a picker for. */
export const CARD_FILTERS = [
  "contractor",
  "equipment",
  "supplier",
  "account",
] as const;

export type CardFilter = (typeof CARD_FILTERS)[number];

/** The card's picker: the first filter it can offer, and whether it is required. */
export function cardFilter(
  definition: Pick<ReportDefinition, "filters">,
): { key: CardFilter; required: boolean } | null {
  for (const filter of definition.filters) {
    const key = CARD_FILTERS.find((item) => item === filter.key);
    if (key != null) return { key, required: filter.required };
  }
  return null;
}

/** The Reports page's groups: heading and what they hold. */
export const REPORT_GROUP_COPY: Record<
  ReportDefinition["group"],
  { title: string; description: string }
> = {
  labour: {
    title: "Labour and vendor reports",
    description:
      "Each report is an Excel workbook and a PDF with the Company header, the period and totals.",
  },
  site_work: {
    title: "Site work",
    description:
      "Daily Worksheets, Equipment Usage sheets, maintenance and transfers, as an Excel workbook and a PDF.",
  },
  tracking: {
    title: "Tasks, issues and inspections",
    description:
      "Tasks, Issues & Snags and Inspection Requests on this Project, as an Excel workbook and a PDF.",
  },
  finance: {
    title: "Payments and accounts",
    description:
      "Transactions, petty cash, party payments, Other Expenses and due payments on this Project, as an Excel workbook and a PDF.",
  },
  procurement: {
    title: "Materials",
    description:
      "Purchase Requests, Purchase Orders, material received and transferred, and the Stock Register, as an Excel workbook and a PDF.",
  },
  progress: {
    title: "Progress Reports",
    description:
      "Daily and Task Progress Reports, generated from the Project's Progress Reports.",
  },
};

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
