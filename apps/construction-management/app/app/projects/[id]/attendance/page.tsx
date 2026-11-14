import { redirect } from "next/navigation";

import { ATTENDANCE_HOME_SEGMENT } from "@/app/app/_components/attendance/attendance-tabs";

/** Attendance opens on its first sub-tab, Check-In (ADR CM-0043 §7). */
export default async function ProjectAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(
    `/app/projects/${encodeURIComponent(id)}/attendance/${ATTENDANCE_HOME_SEGMENT}`,
  );
}
