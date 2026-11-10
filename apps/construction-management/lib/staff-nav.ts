import {
  Handshake,
  HardHat,
  ShieldCheck,
  Shovel,
  Users,
  type LucideIcon,
} from "lucide-react";

export type StaffSection = {
  href: string;
  /** Sidebar label. */
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

/** The Staff area of Human Resources; every page in the group lives under it. */
export const STAFF_AREA_PATH = "/app/staff";

export const LABOURS_PAGE_PATH = `${STAFF_AREA_PATH}/labours`;
export const SITE_ENGINEERS_PATH = `${STAFF_AREA_PATH}/site-engineers`;
export const VENDORS_PATH = `${STAFF_AREA_PATH}/vendors`;
export const STAFF_PATH = `${STAFF_AREA_PATH}/office-staff`;
export const ROLES_PATH = `${STAFF_AREA_PATH}/roles`;

/**
 * Your own Labours, the Site Engineers who look after them, and the Vendors
 * you hire gangs from. Every Company member with Human Resources sees these.
 */
export const LABOUR_SECTIONS: readonly StaffSection[] = [
  {
    href: LABOURS_PAGE_PATH,
    label: "Labour",
    title: "Labours",
    description: "Your own Labours: wage, Project, transfers and Excel import.",
    icon: Shovel,
  },
  {
    href: SITE_ENGINEERS_PATH,
    label: "Site Engineer",
    title: "Site Engineers",
    description: "The people on site who look after a group of Labours.",
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
 * The Staff group of Human Resources (ADR CM-0034): Labour, Site Engineer,
 * Vendor, then Office Staff and Role Management when the viewer may open them.
 */
export function staffSections(
  canOpenStaffRoles: boolean,
): readonly StaffSection[] {
  return canOpenStaffRoles
    ? [...LABOUR_SECTIONS, ...STAFF_ROLES_SECTIONS]
    : LABOUR_SECTIONS;
}

/** The Staff section a path belongs to (its page or anything under it). */
export function activeStaffSection(pathname: string): StaffSection | undefined {
  return staffSections(true).find(
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
