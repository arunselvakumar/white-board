import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/employees`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Employees (CM-315); a placeholder until that ticket builds it. */
export default function EmployeesPage() {
  return <HrmsComingSoon href={HREF} />;
}
