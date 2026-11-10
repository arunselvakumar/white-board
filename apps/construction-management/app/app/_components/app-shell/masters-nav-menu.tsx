"use client";

import { MASTERS_GROUPS, activeMastersSection } from "@/lib/masters-nav";

import { AreaNavMenu, type AreaNavGroup } from "./area-nav-menu";

/**
 * Masters in the sidebar: the area link plus a submenu of every master,
 * grouped. `groups` and `forceOpen` narrow it to what the menu search
 * matches.
 */
export function MastersNavMenu({
  pathname,
  buttonClassName,
  groups = MASTERS_GROUPS,
  forceOpen,
}: {
  pathname: string;
  buttonClassName: string;
  groups?: readonly AreaNavGroup[];
  forceOpen?: boolean;
}) {
  return (
    <AreaNavMenu
      href="/app/masters"
      label="Masters"
      groups={groups}
      currentHref={activeMastersSection(pathname)?.href}
      pathname={pathname}
      buttonClassName={buttonClassName}
      forceOpen={forceOpen}
    />
  );
}
