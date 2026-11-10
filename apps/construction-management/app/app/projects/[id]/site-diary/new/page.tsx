import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { SiteDiaryNew } from "@/app/app/projects/[id]/site-diary/_components/site-diary-pages";
import { isCalendarDate } from "@/src/shared-kernel/calendar-date";

export const metadata: Metadata = { title: "Write the diary" };

/** A new Site Diary; `?date=` sets its date. */
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
