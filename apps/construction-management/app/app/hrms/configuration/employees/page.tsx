import type { Metadata } from "next";

import { EmployeeSalaryGrid } from "@/components/hrms/employee-salary-grid";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/employees`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Configuration → Employees: each member's salary set-up (CM-315). */
export default function EmployeesPage() {
  return <EmployeeSalaryGrid />;
}
