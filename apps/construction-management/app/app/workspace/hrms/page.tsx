import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = HRMS_PATH;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** HRMS Dashboard (CM-319); a placeholder until that ticket builds it. */
export default function HrmsDashboardPage() {
  return <HrmsComingSoon href={HREF} />;
}
