import type { Metadata } from "next";

import { TeamAttendancePage } from "@/components/hrms/team-attendance-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/attendance/team`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Attendance → Team (CM-309). */
export default function TeamAttendanceRoute() {
  return <TeamAttendancePage />;
}
