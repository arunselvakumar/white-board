import type { Metadata } from "next";
import { AttendanceBatchesScreen } from "@/components/attendance/attendance-screens";
export const metadata: Metadata = { title: "Attendance" };
export default function Page() {
  return <AttendanceBatchesScreen />;
}
