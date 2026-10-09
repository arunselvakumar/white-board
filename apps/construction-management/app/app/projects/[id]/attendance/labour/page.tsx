import type { Metadata } from "next";

import { LabourAttendancePage } from "@/components/attendance/labour/labour-attendance-page";

export const metadata: Metadata = { title: "Labour attendance" };

export default async function ProjectLabourAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full max-w-6xl p-4 sm:p-6">
      <LabourAttendancePage projectId={id} />
    </div>
  );
}
