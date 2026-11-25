"use client";

import { MANAGE_DEPARTMENTS, activeDepartment } from "@/lib/departments-nav";

import { AreaNavMenu, type AreaNavGroup } from "./area-nav-menu";
import { DEPARTMENTS_LABEL } from "./departments-menu";

/**
 * Departments in the sidebar (ADR CM-0046): Human Resources, then
 * Marketing when the viewer's Role opens one of its entries. Each row
 * opens the department's page of cards, where the sidebar swaps to the
 * department's own menu (`department-menu.tsx`, ADR CM-0047). `groups` and
 * `forceOpen` narrow it to what the menu search matches
 * (`departments-menu.ts`). Manage Departments (ADR CM-0049) is lit on its
 * own page.
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
      currentHref={
        activeDepartment(pathname)?.href ??
        (pathname === MANAGE_DEPARTMENTS.href ||
        pathname.startsWith(`${MANAGE_DEPARTMENTS.href}/`)
          ? MANAGE_DEPARTMENTS.href
          : undefined)
      }
      pathname={pathname}
      buttonClassName={buttonClassName}
      forceOpen={forceOpen}
    />
  );
}
