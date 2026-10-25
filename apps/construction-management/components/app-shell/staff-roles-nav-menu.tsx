"use client";

import {
  STAFF_PATH,
  STAFF_ROLES_SECTIONS,
  activeStaffRolesSection,
} from "@/lib/staff-roles-nav";

import { AreaNavMenu } from "./area-nav-menu";

const GROUPS = [{ sections: STAFF_ROLES_SECTIONS }];

/** Staff & Roles in the sidebar (ADR CM-0030 §2): Staff and Role Management. */
export function StaffRolesNavMenu({
  pathname,
  buttonClassName,
}: {
  pathname: string;
  buttonClassName: string;
}) {
  return (
    <AreaNavMenu
      href={STAFF_PATH}
      label="Staff & Roles"
      groups={GROUPS}
      currentHref={activeStaffRolesSection(pathname)?.href}
      pathname={pathname}
      buttonClassName={buttonClassName}
    />
  );
}
