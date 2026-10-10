import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/attendance/monthly`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Monthly Attendance (CM-309); a placeholder until that ticket builds it. */
export default function MonthlyAttendancePage() {
  return <HrmsComingSoon href={HREF} />;
}
