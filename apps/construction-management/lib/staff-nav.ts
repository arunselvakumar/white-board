import {
  Handshake,
  HardHat,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { pageHref, type AppHref } from "@/lib/page-href";

export type StaffSection = {
  href: AppHref;
  /** Sidebar label. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

/** The Staff area of Human Resources; every page in the group lives under it. */
export const STAFF_AREA_PATH = "/app/staff";

export const EMPLOYEES_PATH = `${STAFF_AREA_PATH}/employees`;
export const VENDORS_PATH = `${STAFF_AREA_PATH}/vendors`;
export const STAFF_PATH = `${STAFF_AREA_PATH}/office-staff`;
export const ROLES_PATH = `${STAFF_AREA_PATH}/roles`;

/**
 * Your own Employees (ADR CM-0055) and the Vendors you hire gangs from.
 * Every Company member with Human Resources sees these.
 */
export const PEOPLE_SECTIONS: readonly StaffSection[] = [
  {
    href: EMPLOYEES_PATH,
    label: "Employees",
    title: "Employees",
    description:
      "Your own people on site, by Department and Role: wage, Projects, transfers, sign-in and Excel import.",
    icon: HardHat,
  },
  {
    href: VENDORS_PATH,
    label: "Vendor",
    title: "Vendors",
    description:
      "Labour gangs you hire by the head, with a rate card per shift.",
    icon: Handshake,
  },
];

/**
 * Office Staff and Role Management (ADR CM-0030 §2): the staff who work in
 * the Company, and the Roles that decide what they may do. Shown only with
 * Team Members or Role Management Read.
 */
export const STAFF_ROLES_SECTIONS: readonly StaffSection[] = [
  {
    href: STAFF_PATH,
    label: "Office Staff",
    title: "Office Staff",
    description:
      "Your office staff: their details, Projects, Role and how they sign in.",
    icon: Users,
  },
  {
    href: ROLES_PATH,
    label: "Role Management",
    title: "Role Management",
    description:
      "Roles and their Permission Matrix. Editing a Role changes access for everyone on it.",
    icon: ShieldCheck,
  },
];

/**
 * The Staff group of Human Resources (ADR CM-0034, CM-0055): Employees,
 * Vendor, then Office Staff and Role Management when the viewer may open them.
 */
export function staffSections(
  canOpenStaffRoles: boolean,
): readonly StaffSection[] {
  return canOpenStaffRoles
    ? [...PEOPLE_SECTIONS, ...STAFF_ROLES_SECTIONS]
    : PEOPLE_SECTIONS;
}

/** The Staff section a path belongs to (its page or anything under it). */
export function activeStaffSection(pathname: string): StaffSection | undefined {
  return staffSections(true).find(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}

export function staffPath(id: string): AppHref {
  return pageHref("/app/staff/office-staff/[id]", { id });
}

export function employeePagePath(id: string): AppHref {
  return pageHref("/app/staff/employees/[id]", { id });
}

export function vendorPagePath(id: string): AppHref {
  return pageHref("/app/staff/vendors/[id]", { id });
}

export function rolePath(id: string): AppHref {
  return pageHref("/app/staff/roles/[id]", { id });
}

/** "1 Staff member", "3 Staff": list totals and Role counts. */
export function staffCount(count: number): string {
  return count === 1 ? "1 Staff member" : `${String(count)} Staff`;
}

/** "1 Employee", "3 Employees". */
export function employeeCount(count: number): string {
  return count === 1 ? "1 Employee" : `${String(count)} Employees`;
}

/**
 * Who is on a Role (ADR CM-0055 §2): "3 Staff", "3 Staff · 12 Employees",
 * "12 Employees"; "0 Staff" for nobody. `joiner` puts " and " in a
 * sentence.
 */
export function roleMembersLabel(
  counts: { userCount: number; employeeCount: number },
  joiner = " · ",
): string {
  if (counts.employeeCount === 0) return staffCount(counts.userCount);
  if (counts.userCount === 0) return employeeCount(counts.employeeCount);
  return `${staffCount(counts.userCount)}${joiner}${employeeCount(counts.employeeCount)}`;
}
