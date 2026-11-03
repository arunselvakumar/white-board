/**
 * The main menu (ADR CM-0034): the Company Dashboard (CM-902), Projects,
 * Human Resources (Staff, HRMS and Labour; the area opens on Staff), the
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
    // The area opens on Staff; HRMS and the Labour lists sit beside it in
    // the submenu.
    href: "/app/staff",
    label: "Human Resources",
    title: "Human Resources",
    description:
      "Your staff and their Roles, HRMS for their attendance, leave and salary, and your own Labours, the Vendors you hire gangs from, Labour Categories and Supervisors.",
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
