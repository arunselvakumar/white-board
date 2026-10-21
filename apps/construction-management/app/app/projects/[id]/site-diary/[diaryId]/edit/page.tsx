import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { SiteDiaryEdit } from "@/components/site-work/site-diary/site-diary-pages";
import { SiteDiaryFormSkeleton } from "@/components/site-work/site-work-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Site Diary" };

/** Edit a Site Diary (CM-607). */
export default async function SiteDiaryEditRoute({
  params,
}: {
  params: Promise<{ id: string; diaryId: string }>;
}) {
  const { id, diaryId } = await params;
  if (!(await viewerCan("site_work.site_diary", "update", { projectId: id })))
    return <ProjectNoAccess what="editing the Site Diary" />;
  return (
    <QuerySuspense fallback={<SiteDiaryFormSkeleton projectId={id} />}>
      <SiteDiaryEdit projectId={id} diaryId={diaryId} />
    </QuerySuspense>
  );
}
