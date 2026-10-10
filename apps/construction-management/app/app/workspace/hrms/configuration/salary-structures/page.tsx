import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/salary-structures`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Salary Structures (CM-314); a placeholder until that ticket builds it. */
export default function SalaryStructuresPage() {
  return <HrmsComingSoon href={HREF} />;
}
