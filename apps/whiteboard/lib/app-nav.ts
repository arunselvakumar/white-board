import type { WorkspaceRole } from "./workspace-access";

export const APP_NAV = [
  {
    href: "/",
    label: "Dashboard",
    title: "Owner Dashboard",
    description:
      "Today's Batches, active Students, and outstanding dues will show here.",
  },
  {
    href: "/calendar",
    label: "Calendar",
    title: "Calendar",
    description: "Batch Timings in this Workspace.",
  },
  {
    href: "/online-classes",
    label: "Online Classes",
    title: "Online Classes",
    description: "Upcoming Online and Hybrid Batch Timings.",
  },
  {
    href: "/students",
    label: "Students",
    title: "Students",
    description: "Students in this Workspace will show here.",
  },
  {
    href: "/enquiries",
    label: "Enquiries",
    title: "Enquiries",
    description: "Enquiries, follow-ups, and demos before admission.",
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
    href: "/teachers",
    label: "Teachers",
    title: "Teachers",
    description: "Teachers and their Batch assignments.",
  },
  {
    href: "/attendance",
    label: "Attendance",
    title: "Attendance",
    description: "Daily Batch Attendance Registers.",
  },
  {
    href: "/fees",
    label: "Fees",
    title: "Fees",
    description: "Fee Payments and remaining dues will show here.",
  },
] as const;

export const STUDENT_NAV = [
  {
    href: "/student",
    label: "Home",
    title: "Student Home",
    description: "Next Class, dues, Attendance, and recordings.",
  },
  {
    href: "/student/homework",
    label: "Homework",
    title: "Homework",
    description: "Homework and Study Material from my Batches.",
  },
  {
    href: "/student/results",
    label: "Results",
    title: "Results",
    description: "My published Test results.",
  },
  {
    href: "/calendar",
    label: "Calendar",
    title: "Calendar",
    description: "My Batch Timings.",
  },
  {
    href: "/online-classes",
    label: "Online Classes",
    title: "Online Classes",
    description: "My upcoming Online and Hybrid Batch Timings.",
  },
] as const;

export const PARENT_NAV = [
  {
    href: "/parent",
    label: "Home",
    title: "Parent Home",
    description:
      "Next Class, dues, Attendance, and recordings for each Student.",
  },
  {
    href: "/parent/homework",
    label: "Homework",
    title: "Homework",
    description: "Homework and Study Material for each Student.",
  },
  {
    href: "/parent/results",
    label: "Results",
    title: "Results",
    description: "Published Test results for each Student.",
  },
  {
    href: "/calendar",
    label: "Calendar",
    title: "Calendar",
    description: "Student Batch Timings.",
  },
  {
    href: "/online-classes",
    label: "Online Classes",
    title: "Online Classes",
    description: "Upcoming Online and Hybrid Batch Timings.",
  },
] as const;

export const TEACHER_NAV = [
  {
    href: "/teacher",
    label: "My Batches",
    title: "My Batches",
    description: "Assigned Batches.",
  },
  {
    href: "/enquiries",
    label: "Enquiries",
    title: "Enquiries",
    description: "Enquiries, follow-ups, and demos before admission.",
  },
  {
    href: "/calendar",
    label: "Calendar",
    title: "Calendar",
    description: "My assigned Batch Timings.",
  },
  {
    href: "/online-classes",
    label: "Online Classes",
    title: "Online Classes",
    description: "Upcoming Online and Hybrid Batch Timings.",
  },
] as const;

export function navForRole(role: WorkspaceRole) {
  if (role === "owner") return APP_NAV;
  if (role === "student") return STUDENT_NAV;
  if (role === "parent") return PARENT_NAV;
  if (role === "teacher") return TEACHER_NAV;
  return [];
}

export type AppNavItem =
  | (typeof APP_NAV)[number]
  | (typeof STUDENT_NAV)[number]
  | (typeof PARENT_NAV)[number]
  | (typeof TEACHER_NAV)[number];
export type AppNavHref = AppNavItem["href"];

export function isAppNavActive(pathname: string, href: string): boolean {
  // Family Homes have their own nav items beneath them (/student/homework).
  if (href === "/" || href === "/student" || href === "/parent") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function appPageByHref(href: AppNavHref): AppNavItem {
  const page = [...APP_NAV, ...STUDENT_NAV, ...PARENT_NAV, ...TEACHER_NAV].find(
    (item) => item.href === href,
  );
  if (page === undefined) {
    throw new Error(`Unknown in-app route: ${href}`);
  }
  return page;
}
