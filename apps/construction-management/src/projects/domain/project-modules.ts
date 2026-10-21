/**
 * The modules of a Project's home and sidebar (ADR CM-0013 §11, CM-0020), in
 * the default order. A module is shown when it exists, the member may read
 * its menu, and nobody hid it on the Project; Wings and Locations also
 * follow the Project's structure. Later milestones add their modules here.
 *
 * `menu` is the Permission Matrix menu whose Read flag shows the module;
 * `segment` is the path under `/app/projects/<id>/`. Keys are stored (hidden
 * modules, tile order): never rename one.
 */
export const PROJECT_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "KPIs, attendance and the Project summary over a period.",
    segment: "dashboard",
    menu: "reporting.project_dashboard",
  },
  {
    key: "wings",
    label: "Wings",
    description: "Phases, Wings, Floors and Units of the building.",
    segment: "wings",
    menu: "projects.wings",
    structure: "wings",
  },
  {
    key: "locations",
    label: "Locations",
    description: "Named places on a site that has no Wings.",
    segment: "locations",
    menu: "projects.locations",
    structure: "locations",
  },
  {
    key: "amenities",
    label: "Amenities",
    description: "Amenities and Common Developments this Project has.",
    segment: "amenities",
    menu: "projects.project",
  },
  {
    key: "drawings",
    label: "Drawings",
    description: "Drawing albums with every revision.",
    segment: "drawings",
    menu: "projects.drawings",
  },
  {
    key: "testing_reports",
    label: "Testing Reports",
    description: "Lab reports per testing item: cubes, steel, cement.",
    segment: "testing-reports",
    menu: "projects.testing_reports",
  },
  {
    key: "gallery",
    label: "Gallery",
    description: "Every photo and PDF of the Project in one place.",
    segment: "gallery",
    menu: "projects.gallery",
  },
  {
    key: "documents",
    label: "Documents",
    description: "Tender, Quotation, LOA, PO / WO and Agreement files.",
    segment: "documents",
    menu: "projects.project",
  },
  {
    key: "resources",
    label: "Resources",
    description: "Team Members, Contractors, Suppliers and Vendors on it.",
    segment: "resources",
    menu: "projects.project",
  },
  {
    key: "attendance",
    label: "Attendance",
    description: "Mark labour and vendor attendance.",
    segment: "attendance",
    menu: "labour.attendance",
  },
  {
    key: "payments",
    label: "Payments",
    description:
      "Party bills and payments, transactions, petty cash, expenses and wages.",
    segment: "payments",
    menu: "finance.payments",
    // M2's wage payments came first; any tab's menu shows the module (M7).
    alsoMenus: [
      "labour.attendance",
      "labour.labour",
      "labour.vendor",
      "finance.transactions",
      "finance.parties",
      "finance.petty_cash",
      "finance.other_expenses",
    ],
  },
  {
    key: "materials",
    label: "Materials",
    description: "Requests, orders, receipts, stock and transfers.",
    segment: "materials",
    menu: "procurement.manage_materials",
  },
  {
    key: "daily_worksheet",
    label: "Daily Worksheet",
    description: "Work done by each crew: labour, materials and photos.",
    segment: "worksheets",
    menu: "site_work.daily_worksheet",
  },
  {
    key: "equipment_usage",
    label: "Equipment",
    description: "Equipment on site and its daily usage sheets.",
    segment: "equipment",
    menu: "site_work.equipment_usage",
  },
  {
    key: "site_diary",
    label: "Site Diary",
    description: "Weather, visitors and instructions, day by day.",
    segment: "site-diary",
    menu: "site_work.site_diary",
  },
  {
    key: "hindrances",
    label: "Hindrances",
    description: "Stoppages with their cause, duration and party.",
    segment: "hindrances",
    menu: "site_work.hindrances",
  },
  // Tracking (M8, ADR CM-0019).
  {
    key: "tasks",
    label: "Tasks",
    description: "The plan as a task tree: baseline, progress and a Gantt.",
    segment: "tasks",
    menu: "tracking.tasks",
  },
  {
    key: "issues",
    label: "Issues & Snags",
    description: "Snags and issues to solve, verify or reopen.",
    segment: "issues",
    menu: "tracking.issues",
  },
  {
    key: "inspections",
    label: "Inspections",
    description: "Inspection Requests with observations and decisions.",
    segment: "inspections",
    menu: "tracking.inspection_requests",
  },
  // Sales (M10, ADR CM-0022 §1). A Project without Wings has no units to
  // book, so Bookings follows the Wings structure.
  {
    key: "inquiries",
    label: "Inquiries",
    description: "Leads followed up through the funnel to a booking.",
    segment: "inquiries",
    menu: "sales.inquiries",
  },
  {
    key: "bookings",
    label: "Bookings",
    description: "Units on hold, booked and available.",
    segment: "bookings",
    menu: "sales.bookings",
    structure: "wings",
  },
  // Contracts (M11, ADR CM-0023 §22). Client Bills starts hidden on Own
  // development Projects.
  {
    key: "boq",
    label: "BOQ",
    description: "The bill of quantities, its sections and Variations.",
    segment: "boq",
    menu: "contracts.boq",
  },
  {
    key: "work_orders",
    label: "Work Orders",
    description: "Contractors' work at item rates, with terms.",
    segment: "work-orders",
    menu: "contracts.work_orders",
  },
  {
    key: "measurements",
    label: "Measurements",
    description: "The Measurement Book and joint measurements.",
    segment: "measurements",
    menu: "contracts.measurements",
  },
  {
    key: "contractor_bills",
    label: "Contractor Bills",
    description: "RA bills from Contractors against Work Orders.",
    segment: "contractor-bills",
    menu: "contracts.contractor_bills",
  },
  {
    key: "client_bills",
    label: "Client Bills",
    description: "RA bills to the Client against the BOQ.",
    segment: "client-bills",
    menu: "contracts.client_bills",
  },
  {
    key: "progress_reports",
    label: "Progress Reports",
    description: "Daily Progress Reports as PDFs.",
    segment: "progress-reports",
    menu: "site_work.progress_reports",
  },
  {
    key: "reports",
    label: "Reports",
    description: "Labour, daily work and equipment reports.",
    segment: "reports",
    menu: "reporting.project_reports",
  },
] as const satisfies readonly {
  key: string;
  label: string;
  /** One line under the label on the home tile. */
  description: string;
  segment: string;
  menu: string;
  /** Other menus whose Read also shows the module (a hub of tabs). */
  alsoMenus?: readonly string[];
  structure?: "wings" | "locations";
}[];

export type ProjectModuleKey = (typeof PROJECT_MODULES)[number]["key"];

export const PROJECT_MODULE_KEYS: readonly ProjectModuleKey[] =
  PROJECT_MODULES.map((module) => module.key);

export function isProjectModuleKey(value: string): value is ProjectModuleKey {
  return (PROJECT_MODULE_KEYS as readonly string[]).includes(value);
}
