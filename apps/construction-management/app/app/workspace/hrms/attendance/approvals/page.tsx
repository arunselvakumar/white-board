import type { Metadata } from "next";

import { HrmsComingSoon } from "@/components/hrms/hrms-coming-soon";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/attendance/approvals`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Attendance Approvals (CM-309); a placeholder until that ticket builds it. */
export default function AttendanceApprovalsPage() {
  return <HrmsComingSoon href={HREF} />;
}
