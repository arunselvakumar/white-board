"use client";

import { activeDepartment } from "@/lib/departments-nav";

import { AreaNavMenu, type AreaNavGroup } from "./area-nav-menu";
import { DEPARTMENTS_LABEL } from "./departments-menu";

/**
 * Departments in the sidebar (ADR CM-0046): Human Resources, then
 * Marketing when the viewer's Role opens one of its entries. Each row
 * opens the department's page of cards, and stays lit on every screen of
 * the department (Staff and HRMS, or Marketing's pages). `groups` and
 * `forceOpen` narrow it to what the menu search matches
 * (`departments-menu.ts`).
 */
export function DepartmentsNavMenu({
  pathname,
  buttonClassName,
  groups,
  forceOpen,
}: {
  pathname: string;
  buttonClassName: string;
  groups: readonly AreaNavGroup[];
  forceOpen?: boolean;
}) {
  return (
    <AreaNavMenu
      href="/app/departments"
      label={DEPARTMENTS_LABEL}
      groups={groups}
      currentHref={activeDepartment(pathname)?.href}
      pathname={pathname}
      buttonClassName={buttonClassName}
      forceOpen={forceOpen}
    />
  );
}
