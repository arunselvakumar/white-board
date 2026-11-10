import type { Metadata } from "next";

import { SalaryStructuresList } from "@/app/app/hrms/configuration/salary-structures/_components/salary-structures-list";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/salary-structures`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

export default function SalaryStructuresPage() {
  return <SalaryStructuresList />;
}
