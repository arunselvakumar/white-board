import type { Metadata } from "next";

import { AttendanceScreen } from "@/app/(app)/preschool/attendance/_components/attendance-screen";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return <AttendanceScreen />;
}
