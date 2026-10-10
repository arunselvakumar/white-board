/**
 * The modules of a Project's home and section links (ADR CM-0013 §11), in
 * the default order. A module is shown when it exists, the member may read
 * its menu, and nobody hid it on the Project; Wings and Locations also
 * follow the Project's structure. Later milestones add their modules here.
 *
 * `menu` is the Permission Matrix menu whose Read flag shows the module;
 * `segment` is the path under `/app/projects/<id>/`.
 */
export const PROJECT_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    segment: "dashboard",
    menu: "reporting.project_dashboard",
  },
  {
    key: "wings",
    label: "Wings",
    segment: "wings",
    menu: "projects.wings",
    structure: "wings",
  },
  {
    key: "locations",
    label: "Locations",
    segment: "locations",
    menu: "projects.locations",
    structure: "locations",
  },
  {
    key: "amenities",
    label: "Amenities",
    segment: "amenities",
    menu: "projects.project",
  },
  {
    key: "drawings",
    label: "Drawings",
    segment: "drawings",
    menu: "projects.drawings",
  },
  {
    key: "testing_reports",
    label: "Testing Reports",
    segment: "testing-reports",
    menu: "projects.testing_reports",
  },
  {
    key: "gallery",
    label: "Gallery",
    segment: "gallery",
    menu: "projects.gallery",
  },
  {
    key: "documents",
    label: "Documents",
    segment: "documents",
    menu: "projects.project",
  },
  {
    key: "resources",
    label: "Resources",
    segment: "resources",
    menu: "projects.project",
  },
  {
    key: "attendance",
    label: "Attendance",
    segment: "attendance",
    menu: "labour.attendance",
  },
  {
    key: "payments",
    label: "Payments",
    segment: "payments",
    menu: "labour.attendance",
  },
  {
    key: "reports",
    label: "Reports",
    segment: "reports",
    menu: "reporting.project_reports",
  },
] as const satisfies readonly {
  key: string;
  label: string;
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
