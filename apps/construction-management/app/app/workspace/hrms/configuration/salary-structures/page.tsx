import type { Metadata } from "next";

import { SalaryStructuresList } from "@/components/hrms/salary-structures-list";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/salary-structures`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Configuration → Salary Structures (CM-314). */
export default function SalaryStructuresPage() {
  return <SalaryStructuresList />;
}
