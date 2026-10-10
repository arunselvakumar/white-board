/**
 * The modules of a Project's home and section links (ADR CM-0013 §11), in
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
    description: "Labour and vendor wage payments and balances.",
    segment: "payments",
    menu: "labour.attendance",
  },
  {
    key: "materials",
    label: "Materials",
    description: "Requests, orders, receipts, stock and transfers.",
    segment: "materials",
    menu: "procurement.manage_materials",
  },
  {
    key: "reports",
    label: "Reports",
    description: "Attendance, muster roll and payment reports.",
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
  structure?: "wings" | "locations";
}[];

export type ProjectModuleKey = (typeof PROJECT_MODULES)[number]["key"];

export const PROJECT_MODULE_KEYS: readonly ProjectModuleKey[] =
  PROJECT_MODULES.map((module) => module.key);

export function isProjectModuleKey(value: string): value is ProjectModuleKey {
  return (PROJECT_MODULE_KEYS as readonly string[]).includes(value);
}
