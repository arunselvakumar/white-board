import type { Metadata } from "next";
import { BatchAttendanceScreen } from "@/components/attendance/attendance-screens";
export const metadata: Metadata = { title: "Batch Attendance" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BatchAttendanceScreen batchId={id} teacher />;
}
