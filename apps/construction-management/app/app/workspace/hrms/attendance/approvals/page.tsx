import type { Metadata } from "next";

import { AttendanceApprovalsPage } from "@/components/hrms/attendance-approvals-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/attendance/approvals`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Attendance → Approvals (CM-309). */
export default function AttendanceApprovalsRoute() {
  return <AttendanceApprovalsPage />;
}
