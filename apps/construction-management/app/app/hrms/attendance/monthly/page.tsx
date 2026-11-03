import type { Metadata } from "next";

import { MonthlyAttendancePage } from "@/components/hrms/monthly-attendance-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/attendance/monthly`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Attendance → Monthly (CM-309). */
export default function MonthlyAttendanceRoute() {
  return <MonthlyAttendancePage />;
}
