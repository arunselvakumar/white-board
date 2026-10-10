import type { Metadata } from "next";

import { MyAttendancePage } from "@/components/hrms/my-attendance-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/attendance/my`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

/** Attendance → My Attendance (CM-309). */
export default function MyAttendanceRoute() {
  return <MyAttendancePage />;
}
