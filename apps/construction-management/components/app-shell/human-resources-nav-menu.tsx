"use client";

import { HRMS_PATH, HRMS_SECTIONS, activeHrmsSection } from "@/lib/hrms-nav";
import {
  LABOUR_VENDORS_SECTIONS,
  activeLabourVendorsSection,
} from "@/lib/labour-vendors-nav";
import {
  STAFF_PATH,
  STAFF_ROLES_SECTIONS,
  activeStaffRolesSection,
} from "@/lib/staff-roles-nav";

import { AreaNavMenu, type AreaNavGroup } from "./area-nav-menu";

const STAFF_GROUP: AreaNavGroup = {
  label: "Staff",
  sections: STAFF_ROLES_SECTIONS,
};
const HRMS_GROUP: AreaNavGroup = { label: "HRMS", sections: HRMS_SECTIONS };
const LABOUR_GROUP: AreaNavGroup = {
  label: "Labour",
  sections: LABOUR_VENDORS_SECTIONS,
};

/** The submenu entry a Human Resources page belongs to, if any. */
export function activeHumanResourcesHref(pathname: string): string | undefined {
  return (
    activeStaffRolesSection(pathname)?.href ??
    activeHrmsSection(pathname)?.href ??
    activeLabourVendorsSection(pathname)?.href
  );
}

/**
 * Human Resources in the sidebar (ADR CM-0034), in three groups: Staff
 * (Staff, Role Management), HRMS (its five sections) and Labour (Labours,
 * Supervisors, Vendors; ADR CM-0035). The area opens on Staff.
 * Without Team Members or Role Management Read the Staff group is left out
 * and the area opens on HRMS instead, so an HRMS Team Member lands on
 * their own screens.
 */
export function HumanResourcesNavMenu({
  pathname,
  buttonClassName,
  canOpenStaffRoles,
}: {
  pathname: string;
  buttonClassName: string;
  canOpenStaffRoles: boolean;
}) {
  const groups = canOpenStaffRoles
    ? [STAFF_GROUP, HRMS_GROUP, LABOUR_GROUP]
    : [HRMS_GROUP, LABOUR_GROUP];
  return (
    <AreaNavMenu
      href={STAFF_PATH}
      linkHref={canOpenStaffRoles ? STAFF_PATH : HRMS_PATH}
      label="Human Resources"
      groups={groups}
      currentHref={activeHumanResourcesHref(pathname)}
      pathname={pathname}
      buttonClassName={buttonClassName}
    />
  );
}
