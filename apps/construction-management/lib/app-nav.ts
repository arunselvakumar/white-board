/**
 * The main menu (ADR CM-0034): the Company Dashboard (CM-902), Projects,
 * Human Resources (Staff and HRMS; the area opens on Labour), the
 * two cross-project areas Workspace and Masters (`docs/00-overview.md`,
 * "The shape of the product"), then Settings: the Company profile and the
 * Advanced Settings. Each area grows its own screens in later milestones.
 * The Dashboard shows only with the Dashboard menu's Read flag
 * (`AppShell`'s `canOpenDashboard`).
 */
export const APP_NAV = [
  {
    href: "/app/dashboard",
    label: "Dashboard",
    title: "Dashboard",
    description:
      "Your Company at a glance: approvals waiting, open issues and inspections, labour on site today and amounts due, across your Projects.",
  },
  {
    href: "/app/projects",
    label: "Projects",
    title: "Projects",
    description:
      "Your Company's Projects will show here: daily work, materials, labour and payments per site.",
  },
  {
    // Every Staff page (Labour, Site Engineer, Vendor, Office Staff, Role
    // Management) lives under /app/staff; the area opens on Labour, and
    // HRMS sits beside Staff in the submenu.
    href: "/app/staff",
    label: "Human Resources",
    title: "Human Resources",
    description:
      "Your own Labours, their Site Engineers and the Vendors you hire gangs from, your Office Staff and their Roles, and HRMS for attendance, leave and salary.",
  },
  {
    href: "/app/workspace",
    label: "Workspace",
    title: "Workspace",
    description:
      "Work across all your Projects: Central Store for your warehouses, Material Requests and Delivery Notes, Central Inventory for stock everywhere, Central Payment for dues and balances, and Central Reports for reports across your Projects.",
  },
  {
    href: "/app/masters",
    label: "Masters",
    title: "Masters",
    description:
      "Your Company's lists: Contractors, Suppliers, Materials, Measurement Units, Terms & Conditions and Departments.",
  },
  {
    href: "/app/settings",
    label: "Settings",
    title: "Settings",
    description:
      "How your Company appears on documents, and the Advanced Settings: Sequence IDs, Back-dated Entry, billing addresses, GRN fields, ownership and backup.",
  },
] as const;

export type AppNavItem = (typeof APP_NAV)[number];
export type AppNavHref = AppNavItem["href"];

export function appPageByHref(href: AppNavHref): AppNavItem {
  const page = APP_NAV.find((item) => item.href === href);
  if (page == null) throw new Error(`No app page for ${href}`);
  return page;
}

/** Whether a nav item is the current area (its page or anything under it). */
export function isAppNavActive(pathname: string, href: AppNavHref): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
