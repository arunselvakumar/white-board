"use client";

import {
  USERS_PATH,
  USERS_ROLES_SECTIONS,
  activeUsersRolesSection,
} from "@/lib/users-roles-nav";

import { AreaNavMenu } from "./area-nav-menu";

const GROUPS = [{ sections: USERS_ROLES_SECTIONS }];

/** Users & Roles in the sidebar (ADR CM-0029 §2): Users and Role Management. */
export function UsersRolesNavMenu({
  pathname,
  buttonClassName,
}: {
  pathname: string;
  buttonClassName: string;
}) {
  return (
    <AreaNavMenu
      href={USERS_PATH}
      label="Users & Roles"
      groups={GROUPS}
      currentHref={activeUsersRolesSection(pathname)?.href}
      pathname={pathname}
      buttonClassName={buttonClassName}
    />
  );
}
