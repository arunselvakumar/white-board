/**
 * The main menu: the Company Dashboard (CM-902), the three top-level areas
 * (`docs/00-overview.md`, "The shape of the product"), then Settings: the
 * Company profile and the Advanced Settings. Each area grows its own
 * screens in later milestones. The Dashboard shows only
 * with the Dashboard menu's Read flag (`AppShell`'s `canOpenDashboard`).
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
    href: "/app/workspace",
    label: "Workspace",
    title: "Workspace",
    description:
      "Work across all your Projects: HRMS for your staff's attendance, leave and salary, Central Store for your warehouses, Material Requests and Delivery Notes, and Central Inventory for stock everywhere, Central Payment for dues and balances, and Central Reports for reports across your Projects.",
  },
  {
    href: "/app/masters",
    label: "Masters",
    title: "Masters",
    description:
      "Your Company's lists: Designations, Contractors, Suppliers, Materials, Measurement Units, Terms & Conditions, Vendors, Labours and Departments.",
  },
  {
    // The area opens on Users; Role Management sits beside it in the submenu.
    href: "/app/users",
    label: "Users & Roles",
    title: "Users & Roles",
    description:
      "Your team and how they sign in, and the Roles that decide what each one may do.",
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
