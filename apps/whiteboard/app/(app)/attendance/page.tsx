import type { Metadata } from "next";
import { AttendanceBatchesScreen } from "@/app/(app)/_components/attendance/attendance-screens";
export const metadata: Metadata = { title: "Attendance" };
export default function Page() {
  return <AttendanceBatchesScreen />;
}
