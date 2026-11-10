"use client";

import { HRMS_PATH, HRMS_SECTIONS, activeHrmsSection } from "@/lib/hrms-nav";
import {
  LABOURS_PAGE_PATH,
  STAFF_AREA_PATH,
  activeStaffSection,
  staffSections,
} from "@/lib/staff-nav";

import { AreaNavMenu, type AreaNavGroup } from "./area-nav-menu";

const HRMS_GROUP: AreaNavGroup = { label: "HRMS", sections: HRMS_SECTIONS };

/** The submenu entry a Human Resources page belongs to, if any. */
export function activeHumanResourcesHref(pathname: string): string | undefined {
  return (
    activeStaffSection(pathname)?.href ?? activeHrmsSection(pathname)?.href
  );
}

/**
 * The Human Resources groups: Staff, then HRMS. Without Team Members or
 * Role Management Read, Office Staff and Role Management are left out of
 * Staff.
 */
export function humanResourcesGroups(
  canOpenStaffRoles: boolean,
): readonly AreaNavGroup[] {
  return [
    { label: "Staff", sections: staffSections(canOpenStaffRoles) },
    HRMS_GROUP,
  ];
}

/**
 * Human Resources in the sidebar (ADR CM-0034), in two groups: Staff
 * (Labour, Site Engineer, Vendor, Office Staff, Role Management) and HRMS
 * (its five sections). Every Staff page lives under `/app/staff`, and the
 * area opens on Labour. Without Team Members or Role Management Read,
 * Office Staff and Role Management are left out and the area opens on HRMS
 * instead, so an HRMS Team Member lands on their own screens. `groups` and
 * `forceOpen` narrow it to what the menu search matches.
 */
export function HumanResourcesNavMenu({
  pathname,
  buttonClassName,
  canOpenStaffRoles,
  groups = humanResourcesGroups(canOpenStaffRoles),
  forceOpen,
}: {
  pathname: string;
  buttonClassName: string;
  canOpenStaffRoles: boolean;
  groups?: readonly AreaNavGroup[];
  forceOpen?: boolean;
}) {
  return (
    <AreaNavMenu
      href={STAFF_AREA_PATH}
      linkHref={canOpenStaffRoles ? LABOURS_PAGE_PATH : HRMS_PATH}
      label="Human Resources"
      groups={groups}
      currentHref={activeHumanResourcesHref(pathname)}
      pathname={pathname}
      buttonClassName={buttonClassName}
      forceOpen={forceOpen}
    />
  );
}
