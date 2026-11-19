import { Megaphone, UsersRound, type LucideIcon } from "lucide-react";

import { HRMS_PATH, HRMS_SECTIONS } from "@/lib/hrms-nav";
import {
  MARKETING_PATH,
  marketingSections,
  type MarketingMenuAccess,
} from "@/lib/marketing-nav";
import type { AppHref } from "@/lib/page-href";
import { STAFF_AREA_PATH, staffSections } from "@/lib/staff-nav";

/**
 * Departments (ADR CM-0046): the main menu's home for Human Resources and
 * Marketing. Each department has a page of cards, one per screen, in the
 * same groups its submenu had. Not the Masters list of the same name,
 * which holds trades (RCC, Plumbing).
 */
export const DEPARTMENTS_PATH = "/app/departments";

/** A card on a department's page, or a department's own card. */
export type DepartmentCard = {
  href: AppHref;
  label: string;
  description: string;
  icon: LucideIcon;
};

/** A labelled run of cards; a page with one group can leave the label out. */
export type DepartmentCardGroup = {
  label?: string;
  sections: readonly DepartmentCard[];
};

export type DepartmentKey = "humanResources" | "marketing";

export type Department = DepartmentCard & {
  key: DepartmentKey;
  /** The addresses of the department's screens, for the sidebar's highlight. */
  areas: readonly string[];
};

export const HUMAN_RESOURCES: Department = {
  key: "humanResources",
  href: "/app/departments/human-resources",
  label: "Human Resources",
  description:
    "Your Labours, Site Engineers and Vendors, your Office Staff and their Roles, and HRMS for attendance, leave and salary.",
  icon: UsersRound,
  areas: [STAFF_AREA_PATH, HRMS_PATH],
};

export const MARKETING_DEPARTMENT: Department = {
  key: "marketing",
  href: "/app/departments/marketing",
  label: "Marketing",
  description:
    "Visits to Prospect Companies, the Follow-ups owed after them, your Marketing Team and their reports.",
  icon: Megaphone,
  areas: [MARKETING_PATH],
};

function card({
  href,
  label,
  description,
  icon,
}: DepartmentCard): DepartmentCard {
  return { href, label, description, icon };
}

/**
 * Human Resources' cards: Staff (Labour, Site Engineer, Vendor, then
 * Office Staff and Role Management with Team Members or Role Management
 * Read, ADR CM-0030), then HRMS, one card per HRMS area.
 */
export function humanResourcesGroups(
  canOpenStaffRoles: boolean,
): readonly DepartmentCardGroup[] {
  return [
    { label: "Staff", sections: staffSections(canOpenStaffRoles).map(card) },
    { label: "HRMS", sections: HRMS_SECTIONS.map(card) },
  ];
}

/** Marketing's cards: the entries the viewer's Role opens (ADR CM-0040 §1). */
export function marketingGroups(
  access: MarketingMenuAccess,
): readonly DepartmentCardGroup[] {
  const sections = marketingSections(access).map(card);
  return sections.length === 0 ? [] : [{ sections }];
}

/** What a viewer's Role lets Departments show. */
export type DepartmentsAccess = {
  canOpenStaffRoles: boolean;
  marketing: MarketingMenuAccess;
};

export type VisibleDepartment = {
  department: Department;
  groups: readonly DepartmentCardGroup[];
};

/**
 * The departments the viewer may open, in menu order, each with its cards:
 * Human Resources for everyone, Marketing when the Role opens one of its
 * entries.
 */
export function visibleDepartments({
  canOpenStaffRoles,
  marketing,
}: DepartmentsAccess): VisibleDepartment[] {
  const shown: VisibleDepartment[] = [
    {
      department: HUMAN_RESOURCES,
      groups: humanResourcesGroups(canOpenStaffRoles),
    },
  ];
  const marketingCards = marketingGroups(marketing);
  if (marketingCards.length > 0)
    shown.push({ department: MARKETING_DEPARTMENT, groups: marketingCards });
  return shown;
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * The department a path belongs to: its own page, or any screen of it
 * (Staff and HRMS for Human Resources, Marketing's pages for Marketing).
 */
export function activeDepartment(pathname: string): Department | undefined {
  return [HUMAN_RESOURCES, MARKETING_DEPARTMENT].find(
    (department) =>
      isUnder(pathname, department.href) ||
      department.areas.some((area) => isUnder(pathname, area)),
  );
}
