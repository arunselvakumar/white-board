import type { Metadata } from "next";

import { EmployeeSalaryGrid } from "@/app/app/hrms/configuration/employees/_components/employee-salary-grid";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/employees`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Each member's salary set-up. */
export default function EmployeesPage() {
  return <EmployeeSalaryGrid />;
}
