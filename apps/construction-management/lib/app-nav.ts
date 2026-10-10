/**
 * The three top-level areas (`docs/00-overview.md`, "The shape of the
 * product"). Each area grows its own screens in later milestones.
 */
export const APP_NAV = [
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
      "Work across all your Projects: HRMS for your staff's attendance, leave and salary. Central Store, Central Payment and Central Reports will show here as they are built.",
  },
  {
    href: "/app/masters",
    label: "Masters",
    title: "Masters",
    description:
      "Your Company's lists will show here: Team Members, Departments, Contractors, Suppliers, Vendors and Labours.",
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
