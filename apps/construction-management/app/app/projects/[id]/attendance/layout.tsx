import type { ReactNode } from "react";

import { AttendanceTabs } from "./attendance-tabs";

/** Attendance home: Labour and Vendor sub-tabs inside the project shell. */
export default async function ProjectAttendanceLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="px-6 pt-6">
        <AttendanceTabs projectId={id} />
      </div>
      {children}
    </div>
  );
}
