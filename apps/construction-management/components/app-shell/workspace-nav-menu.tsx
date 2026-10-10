"use client";

import { HRMS_SECTIONS, activeHrmsSection } from "@/lib/hrms-nav";

import { AreaNavMenu } from "./area-nav-menu";

/**
 * The Workspace submenu, one group per cross-project module. Central
 * Store, Central Payment and Central Reports join when they are built.
 */
const WORKSPACE_GROUPS = [{ label: "HRMS", sections: HRMS_SECTIONS }];

/** Workspace in the sidebar: the area link plus HRMS's sections. */
export function WorkspaceNavMenu({
  pathname,
  buttonClassName,
}: {
  pathname: string;
  buttonClassName: string;
}) {
  return (
    <AreaNavMenu
      href="/app/workspace"
      label="Workspace"
      groups={WORKSPACE_GROUPS}
      currentHref={activeHrmsSection(pathname)?.href}
      pathname={pathname}
      buttonClassName={buttonClassName}
    />
  );
}
