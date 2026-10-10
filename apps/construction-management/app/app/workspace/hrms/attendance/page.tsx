import { redirect } from "next/navigation";

import { HRMS_PATH } from "@/lib/hrms-nav";

/** Attendance opens on My Attendance. */
export default function HrmsAttendancePage() {
  redirect(`${HRMS_PATH}/attendance/my`);
}
