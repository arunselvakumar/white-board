import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { SiteDiaryPage } from "@/components/site-work/site-diary/site-diary-page";
import { SiteDiaryPageSkeleton } from "@/components/site-work/site-work-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Site Diary" };

/** The Project's Site Diary, one per date; `?date=` opens a day (CM-607). */
export default async function SiteDiaryRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { id } = await params;
  const { date } = await searchParams;
  if (!(await viewerCan("site_work.site_diary", "read", { projectId: id })))
    return <ProjectNoAccess what="the Site Diary" />;
  return (
    <QuerySuspense fallback={<SiteDiaryPageSkeleton />}>
      <SiteDiaryPage
        projectId={id}
        initialDate={typeof date === "string" ? date : undefined}
      />
    </QuerySuspense>
  );
}
