import type { Metadata } from "next";

import { mainMenuAccess } from "@/app/app/_lib/main-menu-access";
import { HUMAN_RESOURCES, humanResourcesGroups } from "@/lib/departments-nav";

import { DepartmentPage } from "../_components/department-page";

export const metadata: Metadata = { title: HUMAN_RESOURCES.label };

/**
 * Human Resources (ADR CM-0046): Staff, then HRMS, a card per screen.
 * Office Staff and Role Management show with Team Members or Role
 * Management Read (ADR CM-0030); every screen checks again.
 */
export default async function HumanResourcesPage() {
  const { canOpenStaffRoles } = await mainMenuAccess();
  return (
    <DepartmentPage
      title={HUMAN_RESOURCES.label}
      meta="Your people on site and in the office, and HRMS."
      groups={humanResourcesGroups(canOpenStaffRoles)}
    />
  );
}
