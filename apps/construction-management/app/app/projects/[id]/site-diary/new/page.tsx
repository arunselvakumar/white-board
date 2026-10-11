import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { SiteDiaryNew } from "@/components/site-work/site-diary/site-diary-pages";
import { isCalendarDate } from "@/src/shared-kernel/calendar-date";

export const metadata: Metadata = { title: "Write the diary" };

/** A new Site Diary; `?date=` sets its date (CM-607). */
export default async function SiteDiaryNewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { id } = await params;
  const { date } = await searchParams;
  if (!(await viewerCan("site_work.site_diary", "create", { projectId: id })))
    return <ProjectNoAccess what="writing the Site Diary" />;
  return (
    <SiteDiaryNew
      projectId={id}
      date={typeof date === "string" && isCalendarDate(date) ? date : undefined}
    />
  );
}
