"use client";

import { Boxes, Warehouse } from "lucide-react";

import { HRMS_SECTIONS, activeHrmsSection } from "@/lib/hrms-nav";

import { AreaNavMenu } from "./area-nav-menu";

const CENTRAL_STORE_SECTIONS = [
  {
    href: "/app/workspace/central-store",
    label: "Central Store",
    icon: Warehouse,
  },
  {
    href: "/app/workspace/central-inventory",
    label: "Central Inventory",
    icon: Boxes,
  },
] as const;

/**
 * The Workspace submenu, one group per cross-project module. Central
 * Payment and Central Reports join when they are built.
 */
const WORKSPACE_GROUPS = [
  { label: "HRMS", sections: HRMS_SECTIONS },
  { label: "Materials", sections: CENTRAL_STORE_SECTIONS },
];

/** The submenu entry a Workspace page belongs to. */
function activeWorkspaceHref(pathname: string): string | undefined {
  const store = CENTRAL_STORE_SECTIONS.find(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
  return store?.href ?? activeHrmsSection(pathname)?.href;
}

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
      currentHref={activeWorkspaceHref(pathname)}
      pathname={pathname}
      buttonClassName={buttonClassName}
    />
  );
}
