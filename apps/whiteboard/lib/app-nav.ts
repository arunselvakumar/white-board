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

export const STUDENT_NAV = [
  { href: "/student", label: "Student", title: "Student", description: "" },
] as const;

export const PARENT_NAV = [
  { href: "/parent", label: "Parent", title: "Parent", description: "" },
] as const;

export function navForRole(role: string | null | undefined) {
  if (role === "org:admin") return APP_NAV;
  if (role === "org:student") return STUDENT_NAV;
  if (role === "org:parent") return PARENT_NAV;
  return [];
}

export type AppNavItem =
  | (typeof APP_NAV)[number]
  | (typeof STUDENT_NAV)[number]
  | (typeof PARENT_NAV)[number];
export type AppNavHref = AppNavItem["href"];

export function isAppNavActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function appPageByHref(href: AppNavHref): AppNavItem {
  const page = [...APP_NAV, ...STUDENT_NAV, ...PARENT_NAV].find(
    (item) => item.href === href,
  );
  if (page === undefined) {
    throw new Error(`Unknown in-app route: ${href}`);
  }
  return page;
}
