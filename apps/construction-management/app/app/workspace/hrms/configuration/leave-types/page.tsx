import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/configuration/leave-types`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Leave Types & Structures (CM-310); a placeholder until that ticket builds it. */
export default function LeaveTypesPage() {
  return <HrmsComingSoon href={HREF} />;
}
