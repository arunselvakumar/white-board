import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/leave/team`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Team Leaves (CM-313); a placeholder until that ticket builds it. */
export default function TeamLeavesPage() {
  return <HrmsComingSoon href={HREF} />;
}
