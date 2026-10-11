"use client";

import { Boxes, Scale, Wallet, Warehouse } from "lucide-react";

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

/**
 * The Workspace submenu, one group per cross-project module. Central
 * Reports joins when it is built.
 */
const WORKSPACE_GROUPS = [
  { label: "HRMS", sections: HRMS_SECTIONS },
  { label: "Materials", sections: CENTRAL_STORE_SECTIONS },
  { label: "Payments", sections: PAYMENT_SECTIONS },
];

/** The submenu entry a Workspace page belongs to. */
function activeWorkspaceHref(pathname: string): string | undefined {
  const area = [...CENTRAL_STORE_SECTIONS, ...PAYMENT_SECTIONS].find(
    (section) =>
      pathname === section.href || pathname.startsWith(`${section.href}/`),
  );
  return area?.href ?? activeHrmsSection(pathname)?.href;
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
