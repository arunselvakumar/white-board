import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { SiteDiaryEdit } from "@/app/app/projects/[id]/site-diary/_components/site-diary-pages";
import { SiteDiaryFormSkeleton } from "@/app/app/_components/site-work/site-work-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Site Diary" };

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
