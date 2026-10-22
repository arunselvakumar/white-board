import type { ProjectModuleKey } from "./project-modules";

/**
 * The headings of a Project's sidebar menu (ADR CM-0020) and the modules
 * under each, in menu order; the groups are fixed. Opening a Project lands
 * on the first module the member may open (§5), so Dashboard comes first.
 * A new module goes under one heading here.
 */
export const PROJECT_NAV_GROUPS = [
  { label: "Overview", keys: ["dashboard"] },
  { label: "Setup", keys: ["wings", "locations", "amenities", "resources"] },
  {
    label: "Site work",
    keys: [
      "attendance",
      "daily_worksheet",
      "tasks",
      "site_diary",
      "hindrances",
      "equipment_usage",
    ],
  },
  { label: "Materials & money", keys: ["materials", "payments"] },
  { label: "Quality", keys: ["issues", "inspections", "testing_reports"] },
  {
    label: "Contracts",
    keys: [
      "boq",
      "work_orders",
      "measurements",
      "contractor_bills",
      "client_bills",
    ],
  },
  { label: "Sales", keys: ["inquiries", "bookings"] },
  { label: "Files", keys: ["drawings", "documents", "gallery"] },
  { label: "Reports", keys: ["progress_reports", "reports"] },
] as const satisfies readonly {
  label: string;
  keys: readonly ProjectModuleKey[];
}[];
