import type { Metadata } from "next";

import { FamilyAttendanceScreen } from "@/app/(app)/preschool/family/attendance/_components/family-attendance-screen";

export const metadata: Metadata = { title: "Attendance" };

export default function FamilyAttendancePage() {
  return <FamilyAttendanceScreen />;
}
