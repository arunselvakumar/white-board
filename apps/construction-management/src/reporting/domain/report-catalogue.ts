import type { Flag, MenuKey } from "@/src/shared-kernel/access";

import type { ReportFormat, ReportKind } from "./report-job";

/**
 * The one report catalogue (ADR CM-0021 §2, CM-901). Every kind of report
 * job is described here once: its title and wording, where it can be
 * requested (a Project, centrally, or both), the menu and flags it is
 * gated on, its files, whether it carries money and the filters it takes.
 * The kind lists the rest of the code used to keep by hand
 * (`CENTRAL_REPORT_KINDS`, `PROGRESS_REPORT_KINDS`, `reportFormats`, the
 * Reports page's cards) are derived from it, and
 * `GET /api/construction/reporting/catalogue` serves it trimmed to the
 * viewer.
 *
 * Only type imports from `report-job.ts`: that module derives its lists
 * from this one, so a value import back would be a cycle.
 */

/** Where a report can be requested: on a Project, or without one (central). */
export type ReportScope = "project" | "central";

/** The Reports page's groups, in the order it shows them. */
export const REPORT_GROUPS = [
  "labour",
  "site_work",
  "tracking",
  "finance",
  "procurement",
  "progress",
] as const;

export type ReportGroup = (typeof REPORT_GROUPS)[number];

/**
 * What a report is asked for: a date range, a month, the day balances are
 * taken on, a financial year, or one day (the DPR).
 */
export type ReportPeriod = "range" | "month" | "as_on" | "fy" | "date";

/** The filters a request takes beside its period. */
export type ReportFilterKey =
  | "contractor"
  | "supplier"
  | "vendor"
  | "labour_category"
  | "equipment"
  | "account"
  | "category"
  | "mode"
  | "module"
  | "counterparty_kind"
  | "projects"
  | "store"
  | "material"
  | "filled_by"
  | "include_images";

export type ReportFilter = {
  key: ReportFilterKey;
  /** The request is refused without it (the Ledger's account). */
  required?: boolean;
  /** Only in these scopes (the Projects filter is central only). */
  scopes?: readonly ReportScope[];
};

/**
 * Whether the files print amounts: `always` (the report is about money and
 * is refused without the money right), `with_financial` (amounts print
 * when the requester has it), or `never`.
 */
export type ReportMoney = "always" | "with_financial" | "never";

type Wording = {
  description: string;
  /** Shown under the description: what the report needs. */
  needs: string;
};

export type ReportCatalogueDefinition = Wording & {
  title: string;
  group: ReportGroup;
  scopes: readonly ReportScope[];
  /** Different wording when requested without a Project. */
  central?: Wording;
  /**
   * The menu the report is gated on. Requesting needs `request` on it (and
   * on the Project); downloading needs `download`, as today's routes check.
   */
  menu: MenuKey;
  /** Other menus whose `request` flag also allows it (the Ledger: Petty Cash). */
  orMenus?: readonly MenuKey[];
  request: Flag;
  download: Flag;
  /**
   * The menu whose Financial puts amounts in the files, when not `menu`
   * (the DPR's hire cost: Equipment Usage). Finance menus have no
   * Financial: Report on them is the right to see money (CM-0017 §14).
   */
  moneyMenu?: MenuKey;
  money: ReportMoney;
  formats: readonly ReportFormat[];
  period: ReportPeriod;
  filters: readonly ReportFilter[];
  /**
   * A Progress Report (CM-606, CM-805): a PDF of the Project's own
   * Progress Reports module, requested and deleted there, kept until
   * deleted (never expired, CM-0021 §3).
   */
  progressReport: boolean;
  /**
   * False until the report's builder exists (CM-903 builds the procurement
   * and central labour kinds, then flips this): requesting it is 409
   * `REPORT_NOT_AVAILABLE` and the catalogue route leaves it out.
   */
  available: boolean;
};

export type ReportCatalogueEntry = ReportCatalogueDefinition & {
  kind: ReportKind;
};

const PROJECT = ["project"] as const;
const CENTRAL = ["central"] as const;
const BOTH = ["project", "central"] as const;
const TABLE = ["xlsx", "pdf"] as const;
const PDF_ONLY = ["pdf"] as const;
const PROJECTS_FILTER = { key: "projects", scopes: CENTRAL } as const;

/**
 * Every kind, in the order the report screens list them. Declaration order
 * is display order (string keys keep it).
 */
const DEFINITIONS = {
  // Labour and vendor reports (CM-217, CM-218).
  labour_attendance: {
    title: "All Labour Attendance",
    description:
      "Every Labour's days in the period: present, half day, absent, leave, paid leave, holiday and overtime hours, with a day-by-day list.",
    needs: "Needs Labour Report.",
    group: "labour",
    scopes: PROJECT,
    menu: "labour.labour",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [],
    progressReport: false,
    available: true,
  },
  labour_payment: {
    title: "All Labour Payment",
    description:
      "Previous Balance, To Pay, Advance, Paid and Final Amount for each Labour, from the ledger.",
    needs: "Needs Labour Report and Financial.",
    group: "labour",
    scopes: PROJECT,
    menu: "labour.labour",
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "range",
    filters: [],
    progressReport: false,
    available: true,
  },
  labour_month: {
    title: "Month-wise Labour",
    description:
      "Labour × day grid for a month (P, ½, A, L, PL, H) with totals; wages earned with Financial.",
    needs: "Needs Labour Report.",
    group: "labour",
    scopes: PROJECT,
    menu: "labour.labour",
    request: "report",
    download: "report",
    money: "with_financial",
    formats: TABLE,
    period: "month",
    filters: [],
    progressReport: false,
    available: true,
  },
  vendor_attendance: {
    title: "Vendor Attendance",
    description:
      "Each vendor's full days, half days and overtime by shift and Labour Category; rates and pay with Vendor Financial.",
    needs: "Needs Vendor Report.",
    central: {
      description:
        "Every vendor's full days, half days and overtime across the Projects you may see, by Project, shift and Labour Category; rates and pay with Vendor Financial.",
      needs: "Needs Vendor Report; a member sees the Projects they are on.",
    },
    group: "labour",
    scopes: BOTH,
    menu: "labour.vendor",
    request: "report",
    download: "report",
    money: "with_financial",
    formats: TABLE,
    period: "range",
    filters: [{ key: "vendor" }, { key: "labour_category" }],
    progressReport: false,
    available: true,
  },
  muster_roll: {
    title: "Muster roll and wage register",
    description:
      "The combined register of workmen, muster roll and wages for a month: father's name, days, wage rate, overtime, gross, deductions, net and a signature column.",
    needs: "Needs Labour Report and Financial.",
    group: "labour",
    scopes: PROJECT,
    menu: "labour.labour",
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "month",
    filters: [],
    progressReport: false,
    available: true,
  },
  labour_attendance_central: {
    title: "Central Labour Attendance",
    description:
      "Every Project's labour days in the period: present, half day, absent, leave and overtime per Labour, with each Project's totals.",
    needs: "Needs Labour Report; a member sees the Projects they are on.",
    group: "labour",
    scopes: CENTRAL,
    menu: "labour.labour",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [PROJECTS_FILTER],
    progressReport: false,
    available: false,
  },
  // Site work reports (CM-605, CM-608).
  daily_work: {
    title: "Daily Work",
    description:
      "Every worksheet in the period: contractor, department, skilled and unskilled labour, location, work done, shift, photos and consumed material.",
    needs: "Needs Daily Worksheet Report.",
    group: "site_work",
    scopes: PROJECT,
    menu: "site_work.daily_worksheet",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [{ key: "contractor" }],
    progressReport: false,
    available: true,
  },
  owned_equipment_usage: {
    title: "Company Owned Equipment Usage",
    description:
      "Usage sheets of owned equipment: operator, hours, km or trips, idle and breakdown hours, fuel and overruns, with totals per machine.",
    needs: "Needs Equipment Usage Report.",
    group: "site_work",
    scopes: PROJECT,
    menu: "site_work.equipment_usage",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [{ key: "equipment" }],
    progressReport: false,
    available: true,
  },
  rented_equipment_usage: {
    title: "Rented Equipment Usage",
    description:
      "Usage sheets of hired equipment with the hire party, basis and billable quantity; unit rate and hire cost with Financial.",
    needs: "Needs Equipment Usage Report; hire cost needs Financial.",
    group: "site_work",
    scopes: PROJECT,
    menu: "site_work.equipment_usage",
    request: "report",
    download: "report",
    money: "with_financial",
    formats: TABLE,
    period: "range",
    filters: [{ key: "equipment" }],
    progressReport: false,
    available: true,
  },
  equipment_maintenance: {
    title: "Equipment Maintenance",
    description:
      "Maintenance of machines that were at this Project when it started: kind, dates, days, workshop; cost with Financial.",
    needs: "Needs Equipments Report; cost needs Financial.",
    central: {
      description:
        "Maintenance of every machine in the period, with the Project it was at: kind, dates, days, workshop; cost with Financial.",
      needs: "Needs Equipments Report; cost needs Financial.",
    },
    group: "site_work",
    scopes: BOTH,
    menu: "masters.equipments",
    request: "report",
    download: "report",
    money: "with_financial",
    formats: TABLE,
    period: "range",
    filters: [],
    progressReport: false,
    available: true,
  },
  equipment_transfers: {
    title: "Equipment Transfers",
    description:
      "Transfers out of or into this Project: location before, destination, latest location, remarks and who entered them.",
    needs: "Needs Equipments Report.",
    central: {
      description:
        "Every transfer to a Project or the warehouse in the period: location before, destination, latest location, remarks and who entered them.",
      needs: "Needs Equipments Report.",
    },
    group: "site_work",
    scopes: BOTH,
    menu: "masters.equipments",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [],
    progressReport: false,
    available: true,
  },
  // Tracking reports (CM-805, ADR CM-0019 §14).
  task_report: {
    title: "Task Report",
    description:
      "Tasks added in the period in tree order: level, assignees, planned, baseline and actual dates, variance, progress, status, location, department and contractor; Total and Completed Price with Financial.",
    needs:
      "Needs Task Report; prices need Financial; without View all, your own and assigned tasks.",
    group: "tracking",
    scopes: PROJECT,
    menu: "tracking.tasks",
    request: "report",
    download: "report",
    money: "with_financial",
    formats: TABLE,
    period: "range",
    filters: [],
    progressReport: false,
    available: true,
  },
  issue_snag_report: {
    title: "Issue & Snag Report",
    description:
      "Issues and snags by Issue Date: number, details, priority, category, department, contractor, assignee, due date, location, status, solved on and by, closed on.",
    needs:
      "Needs Issues and snags Report; without View all, your own and assigned issues.",
    group: "tracking",
    scopes: PROJECT,
    menu: "tracking.issues",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [],
    progressReport: false,
    available: true,
  },
  inspection_request_report: {
    title: "Inspection Request Report",
    description:
      "Inspection Requests by Inspection Date: number, date and time, department, contractor, inspector, description, location, status, decided by and on, reason and re-inspection of; the Success Rate.",
    needs: "Needs Inspection Request Report.",
    group: "tracking",
    scopes: PROJECT,
    menu: "tracking.inspection_requests",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [],
    progressReport: false,
    available: true,
  },
  // Finance reports (CM-709, ADR CM-0017 §16): all about money; Report on
  // the finance menu is the right to see it.
  transactions: {
    title: "Transactions",
    description:
      "Transactions and transfers on this Project in the period: type, account, category, mode, reference, Paid To / Received From, amount and status.",
    needs: "Needs Transactions Report.",
    group: "finance",
    scopes: PROJECT,
    menu: "finance.transactions",
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "range",
    filters: [],
    progressReport: false,
    available: true,
  },
  petty_cash: {
    title: "Petty Cash",
    description:
      "Vouchers on this Project: date, number, type, category, account, Paid To / Received From, credit, debit and status, with each account's closing balance.",
    needs: "Needs Petty Cash Report; other holders' accounts need View all.",
    group: "finance",
    scopes: PROJECT,
    menu: "finance.petty_cash",
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "range",
    filters: [{ key: "account" }],
    progressReport: false,
    available: true,
  },
  contractor_payments: {
    title: "Contractor Payments",
    description:
      "Per Contractor: opening, invoiced, paid, TDS, written off and closing balance; every invoice with what settled it and every payment.",
    needs: "Needs Parties Report.",
    group: "finance",
    scopes: PROJECT,
    menu: "finance.parties",
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "range",
    filters: [{ key: "contractor" }],
    progressReport: false,
    available: true,
  },
  supplier_payments: {
    title: "Supplier Payments",
    description:
      "Per Supplier: opening, invoiced, paid, written off and closing balance; every invoice with what settled it and every payment.",
    needs: "Needs Parties Report.",
    group: "finance",
    scopes: PROJECT,
    menu: "finance.parties",
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "range",
    filters: [{ key: "supplier" }],
    progressReport: false,
    available: true,
  },
  other_expenses: {
    title: "Other Expenses",
    description:
      "This Project's Other Expenses in the period: category, payee, account, mode, reference, amount and status.",
    needs: "Needs Other Expenses Report.",
    group: "finance",
    scopes: PROJECT,
    menu: "finance.other_expenses",
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "range",
    filters: [],
    progressReport: false,
    available: true,
  },
  account_ledger: {
    title: "Ledger",
    description:
      "One account's opening balance, every entry in the period with its running balance, credit, debit and the closing balance.",
    needs:
      "Needs Company's Bank A/C Report, or Petty Cash Report for a petty-cash account.",
    group: "finance",
    scopes: CENTRAL,
    menu: "masters.bank_accounts",
    orMenus: ["finance.petty_cash"],
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "range",
    filters: [
      { key: "account", required: true },
      { key: "category" },
      { key: "module" },
      { key: "mode" },
      { key: "counterparty_kind" },
    ],
    progressReport: false,
    available: true,
  },
  tds_194c: {
    title: "TDS 194C",
    description:
      "Each Contractor's payments of the financial year with base, rate, TDS and overrides, and the totals by quarter for filing. PANs show the last four characters.",
    needs: "Needs Parties Report; a member sees the Projects they are on.",
    group: "finance",
    scopes: CENTRAL,
    menu: "finance.parties",
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "fy",
    filters: [{ key: "contractor" }],
    progressReport: false,
    available: true,
  },
  due_payments: {
    title: "Due Payments",
    description:
      "Per party with open invoices on this Project: invoiced, paid, due and the due by days past the due date (not due, 0–30, 31–60, 61–90, 90+).",
    needs: "Needs Parties Report.",
    central: {
      description:
        "Every party's open invoices across Projects: invoiced, paid, due and the ageing by days past the due date; receivables of Other Parties apart.",
      needs: "Needs Parties Report; a member sees the Projects they are on.",
    },
    group: "finance",
    scopes: BOTH,
    menu: "finance.parties",
    request: "report",
    download: "report",
    money: "always",
    formats: TABLE,
    period: "as_on",
    filters: [],
    progressReport: false,
    available: true,
  },
  // Procurement reports (CM-903, ADR CM-0021 §5): catalogued now, built
  // by CM-903, which flips `available` and settles their money rule.
  purchase_requests: {
    title: "Purchase Requests",
    description:
      "Purchase Requests raised in the period: number, date, materials and quantities, required by, status and who decided them.",
    needs: "Needs Purchase Request Report.",
    group: "procurement",
    scopes: BOTH,
    menu: "procurement.purchase_requests",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [PROJECTS_FILTER],
    progressReport: false,
    available: false,
  },
  purchase_orders: {
    title: "Purchase Orders",
    description:
      "Purchase Orders in the period: number, date, supplier, materials, quantities ordered and received, value and status.",
    needs: "Needs Purchase Order Report.",
    group: "procurement",
    scopes: BOTH,
    menu: "procurement.purchase_orders",
    request: "report",
    download: "report",
    money: "with_financial",
    formats: TABLE,
    period: "range",
    filters: [{ key: "supplier" }, PROJECTS_FILTER],
    progressReport: false,
    available: false,
  },
  material_received: {
    title: "Material Received",
    description:
      "Material received in the period: date, supplier, PO, challan, materials and quantities; amounts with Material Received Financial.",
    needs: "Needs Material Received Report; amounts need Financial.",
    group: "procurement",
    scopes: BOTH,
    menu: "procurement.material_received",
    request: "report",
    download: "report",
    money: "with_financial",
    formats: TABLE,
    period: "range",
    filters: [{ key: "supplier" }, PROJECTS_FILTER],
    progressReport: false,
    available: false,
  },
  material_transfers: {
    title: "Material Transfers",
    description:
      "Material Transfers in the period: number, from, to, materials, quantities sent and delivered, and status.",
    needs: "Needs Material Transfer Report.",
    group: "procurement",
    scopes: BOTH,
    menu: "procurement.material_transfers",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [PROJECTS_FILTER],
    progressReport: false,
    available: false,
  },
  stock_register: {
    title: "Stock Register",
    description:
      "A ledger per material: opening, received, transferred in and out, consumed, missing and closing stock for the period.",
    needs: "Needs Current Inventory Report.",
    group: "procurement",
    scopes: BOTH,
    menu: "procurement.current_inventory",
    request: "report",
    download: "report",
    money: "never",
    formats: TABLE,
    period: "range",
    filters: [{ key: "material" }, { key: "store" }, PROJECTS_FILTER],
    progressReport: false,
    available: false,
  },
  // Progress Reports (CM-606, CM-805): requested from the Project's
  // Progress Reports module (Progress Report Add / View / Delete).
  daily_progress_report: {
    title: "Daily Progress Report",
    description:
      "One day on the Project: diary and weather, labour, worksheets, equipment usage, materials received and consumed, hindrances and photos.",
    needs:
      "Needs Progress Report Add; hire cost needs Equipment Usage Financial.",
    group: "progress",
    scopes: PROJECT,
    menu: "site_work.progress_reports",
    request: "create",
    download: "read",
    moneyMenu: "site_work.equipment_usage",
    money: "with_financial",
    formats: PDF_ONLY,
    period: "date",
    filters: [{ key: "filled_by" }, { key: "include_images" }],
    progressReport: true,
    available: true,
  },
  task_progress_report: {
    title: "Task Progress Report",
    description:
      "Each task planned or progressed in the period: progress at its start and end, the work done and the updates that moved it.",
    needs: "Needs Progress Report Add.",
    group: "progress",
    scopes: PROJECT,
    menu: "site_work.progress_reports",
    request: "create",
    download: "read",
    money: "never",
    formats: PDF_ONLY,
    period: "range",
    filters: [],
    progressReport: true,
    available: true,
  },
} as const satisfies Record<ReportKind, ReportCatalogueDefinition>;

type Definitions = typeof DEFINITIONS;

/** The kinds whose definition matches `Shape` (e.g. `{ group: "finance" }`). */
export type CatalogueKindsWhere<Shape> = {
  [Kind in keyof Definitions]: Definitions[Kind] extends Shape ? Kind : never;
}[keyof Definitions];

/** Every kind, in display order. */
export const REPORT_CATALOGUE: readonly ReportCatalogueEntry[] = (
  Object.keys(DEFINITIONS) as ReportKind[]
).map((kind) => ({ kind, ...DEFINITIONS[kind] }));

export function catalogueEntry(kind: ReportKind): ReportCatalogueEntry {
  return { kind, ...DEFINITIONS[kind] };
}

/** The kinds whose definition passes `test`, in display order. */
export function catalogueKinds(
  test: (entry: ReportCatalogueEntry) => boolean,
): readonly ReportKind[] {
  return REPORT_CATALOGUE.filter(test).map((entry) => entry.kind);
}

/** The title, wording and filters as a scope shows them. */
export function entryIn(
  entry: ReportCatalogueEntry,
  scope: ReportScope,
): ReportCatalogueEntry {
  const wording = scope === "central" ? entry.central : undefined;
  return {
    ...entry,
    description: wording?.description ?? entry.description,
    needs: wording?.needs ?? entry.needs,
    filters: entry.filters.filter(
      (filter) => filter.scopes == null || filter.scopes.includes(scope),
    ),
  };
}

/** The entries a scope offers, built or not, in display order. */
export function entriesIn(scope: ReportScope): ReportCatalogueEntry[] {
  return REPORT_CATALOGUE.filter((entry) => entry.scopes.includes(scope)).map(
    (entry) => entryIn(entry, scope),
  );
}
