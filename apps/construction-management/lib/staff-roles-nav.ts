import { ShieldCheck, Users, type LucideIcon } from "lucide-react";

export type StaffRolesSection = {
  href: string;
  /** Sidebar label. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const STAFF_PATH = "/app/staff";
export const ROLES_PATH = "/app/roles";

/**
 * Staff & Roles in the main menu (ADR CM-0030 §2): the staff who work in
 * the Company, and the Roles that decide what they may do.
 */
export const STAFF_ROLES_SECTIONS: readonly StaffRolesSection[] = [
  {
    href: STAFF_PATH,
    label: "Staff",
    title: "Staff",
    description:
      "Your staff: their details, Projects, Role and how they sign in.",
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

/** The Staff & Roles section a path belongs to (its page or anything under it). */
export function activeStaffRolesSection(
  pathname: string,
): StaffRolesSection | undefined {
  return STAFF_ROLES_SECTIONS.find(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
}

export function staffPath(id: string): string {
  return `${STAFF_PATH}/${encodeURIComponent(id)}`;
}

export function rolePath(id: string): string {
  return `${ROLES_PATH}/${encodeURIComponent(id)}`;
}

/** "1 Staff member", "3 Staff": list totals and Role counts. */
export function staffCount(count: number): string {
  return count === 1 ? "1 Staff member" : `${String(count)} Staff`;
}
