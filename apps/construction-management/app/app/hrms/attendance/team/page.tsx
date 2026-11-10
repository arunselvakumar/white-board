import type { Metadata } from "next";

import { TeamAttendancePage } from "@/app/app/hrms/attendance/team/_components/team-attendance-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/attendance/team`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

export default function TeamAttendanceRoute() {
  return <TeamAttendancePage />;
}
