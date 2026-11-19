import type { Metadata } from "next";

import { mainMenuAccess } from "@/app/app/_lib/main-menu-access";
import { visibleDepartments } from "@/lib/departments-nav";

import { DepartmentPage } from "./_components/department-page";

export const metadata: Metadata = { title: "Departments" };

/**
 * Departments (ADR CM-0046): a card per department the viewer may open,
 * Human Resources, then Marketing when the Role opens one of its entries.
 */
export default async function DepartmentsPage() {
  const access = await mainMenuAccess();
  return (
    <DepartmentPage
      title="Departments"
      meta="Your Company's departments and their screens."
      groups={[
        {
          sections: visibleDepartments(access).map(
            ({ department: { href, label, description, icon } }) => ({
              href,
              label,
              description,
              icon,
            }),
          ),
        },
      ]}
    />
  );
}
