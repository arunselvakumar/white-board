"use client";

import { Boxes, FileSpreadsheet, Scale, Wallet, Warehouse } from "lucide-react";

import { AreaNavMenu, type AreaNavGroup } from "./area-nav-menu";

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

const PAYMENT_SECTIONS = [
  {
    href: "/app/workspace/central-payment",
    label: "Central Payment",
    icon: Wallet,
  },
  {
    href: "/app/workspace/party-balance",
    label: "Party Balance",
    icon: Scale,
  },
] as const;

const REPORT_SECTIONS = [
  {
    href: "/app/workspace/central-reports",
    label: "Central Reports",
    icon: FileSpreadsheet,
  },
] as const;

/**
 * The Workspace submenu, one group per cross-project module. HRMS was the
 * first group until it moved to Human Resources (ADR CM-0034).
 */
const WORKSPACE_GROUPS: readonly AreaNavGroup[] = [
  { label: "Materials", sections: CENTRAL_STORE_SECTIONS },
  { label: "Payments", sections: PAYMENT_SECTIONS },
  // Central Reports (CM-903).
  { label: "Reports", sections: REPORT_SECTIONS },
];

const WORKSPACE_SECTIONS = WORKSPACE_GROUPS.flatMap((group) => group.sections);

/** The submenu entry a Workspace page belongs to. */
function activeWorkspaceHref(pathname: string): string | undefined {
  return WORKSPACE_SECTIONS.find(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  )?.href;
}

/** Workspace in the sidebar: the area link plus its modules. */
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
