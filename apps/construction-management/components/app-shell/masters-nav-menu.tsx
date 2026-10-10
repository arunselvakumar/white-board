"use client";

import { MASTERS_GROUPS, activeMastersSection } from "@/lib/masters-nav";

import { AreaNavMenu } from "./area-nav-menu";

/** Masters in the sidebar: the area link plus a submenu of every master, grouped. */
export function MastersNavMenu({
  pathname,
  buttonClassName,
}: {
  pathname: string;
  buttonClassName: string;
}) {
  return (
    <AreaNavMenu
      href="/app/masters"
      label="Masters"
      groups={MASTERS_GROUPS}
      currentHref={activeMastersSection(pathname)?.href}
      pathname={pathname}
      buttonClassName={buttonClassName}
    />
  );
}
