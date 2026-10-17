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

/**
 * The other pickers a card can offer (CM-903), besides its one filter
 * above: each "All …" until a choice is made.
 */
export const PICKER_KEYS = [
  "status",
  "transfer_type",
  "supplier",
  "vendor",
  "labour_category",
  "material_category",
  "material",
  "created_by",
  "store",
] as const;

export type PickerKey = (typeof PICKER_KEYS)[number];

/** Choices per picker, and the central Projects. */
export type ReportPickerOptions = Partial<
  Record<PickerKey | "projects", { value: string; label: string }[]>
>;

/** The kinds whose cards offer the pickers (CM-903). */
const PICKER_KINDS: readonly ReportDefinition["kind"][] = [
  "vendor_attendance",
  "purchase_requests",
  "purchase_orders",
  "material_received",
  "material_transfers",
  "stock_register",
  "labour_attendance_central",
];

export const PICKER_COPY: Record<PickerKey, { label: string; all: string }> = {
  status: { label: "Status", all: "All statuses" },
  transfer_type: { label: "Type", all: "All types" },
  supplier: { label: "Supplier", all: "All suppliers" },
  vendor: { label: "Vendor", all: "All vendors" },
  labour_category: { label: "Labour Category", all: "All categories" },
  material_category: { label: "Material Category", all: "All categories" },
  material: { label: "Material", all: "All materials" },
  created_by: { label: "Created By", all: "Anyone" },
  store: { label: "Store", all: "All Stores" },
};

/** The pickers a card offers, in its catalogue filters' order. */
export function cardPickers(
  definition: Pick<ReportDefinition, "kind" | "filters">,
): PickerKey[] {
  if (!PICKER_KINDS.includes(definition.kind)) return [];
  return definition.filters.flatMap((filter) => {
    const key = PICKER_KEYS.find((item) => item === filter.key);
    return key == null ? [] : [key];
  });
}

/** Whether a card takes the central Projects filter. */
export function takesProjects(
  definition: Pick<ReportDefinition, "filters">,
): boolean {
  return definition.filters.some((filter) => filter.key === "projects");
}

const APPROVAL_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const TRANSFER_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In transit" },
  { value: "delivered", label: "Delivered" },
  { value: "rejected", label: "Rejected" },
];

const TRANSFER_TYPE_OPTIONS = [
  { value: "project_to_project", label: "Project to Project" },
  { value: "project_to_store", label: "Project to Store" },
  { value: "store_to_project", label: "Store to Project" },
  { value: "store_to_store", label: "Store to Store" },
];

/** The fixed choices of a status or type picker; null for the others. */
export function pickerStatuses(
  kind: ReportDefinition["kind"],
  key: PickerKey,
): { value: string; label: string }[] | null {
  if (key === "transfer_type") return TRANSFER_TYPE_OPTIONS;
  if (key !== "status") return null;
  return kind === "material_transfers"
    ? TRANSFER_STATUS_OPTIONS
    : APPROVAL_STATUS_OPTIONS;
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
