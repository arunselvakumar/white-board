import type { Metadata } from "next";

import { MyAttendancePage } from "@/app/app/hrms/attendance/my/_components/my-attendance-page";
import { HRMS_PATH, hrmsPage } from "@/lib/hrms-nav";

const HREF = `${HRMS_PATH}/attendance/my`;

export const metadata: Metadata = { title: hrmsPage(HREF).title };

export default function MyAttendanceRoute() {
  return <MyAttendancePage />;
}
