import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/salary/my`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** My Salary (CM-317); a placeholder until that ticket builds it. */
export default function MySalaryPage() {
  return <HrmsComingSoon href={HREF} />;
}
