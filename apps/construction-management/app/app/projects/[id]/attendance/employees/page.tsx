import type { Metadata } from "next";

import { EmployeeAttendancePage } from "@/app/app/projects/[id]/attendance/employees/_components/employee-attendance-page";

export const metadata: Metadata = { title: "Employee attendance" };

export default async function ProjectEmployeeAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="w-full max-w-6xl p-4 sm:p-6">
      <EmployeeAttendancePage projectId={id} />
    </div>
  );
}
