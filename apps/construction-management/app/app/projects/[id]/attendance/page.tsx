import { redirect } from "next/navigation";

/** Attendance opens on its first sub-tab, Labour. */
export default async function ProjectAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/projects/${encodeURIComponent(id)}/attendance/labour`);
}
