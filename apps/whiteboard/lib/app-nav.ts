export const APP_NAV = [
  {
    href: "/",
    label: "Dashboard",
    title: "Owner Dashboard",
    description:
      "Today's Batches, active Students, and outstanding dues will show here.",
  },
  {
    href: "/students",
    label: "Students",
    title: "Students",
    description: "Students in this Workspace will show here.",
  },
  {
    href: "/courses",
    label: "Courses",
    title: "Courses",
    description: "Courses this centre teaches will show here.",
  },
  {
    href: "/batches",
    label: "Batches",
    title: "Batches",
    description: "Batches for those Courses will show here.",
  },
  {
    href: "/fees",
    label: "Fees",
    title: "Fees",
    description: "Fee Payments and remaining dues will show here.",
  },
] as const;

export type AppNavItem = (typeof APP_NAV)[number];
export type AppNavHref = AppNavItem["href"];

export function isAppNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function appPageByHref(href: AppNavHref): AppNavItem {
  const page = APP_NAV.find((item) => item.href === href);
  if (page === undefined) {
    throw new Error(`Unknown in-app route: ${href}`);
  }
  return page;
}
