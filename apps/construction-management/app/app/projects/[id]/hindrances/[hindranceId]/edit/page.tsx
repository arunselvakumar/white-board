import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { HindranceEdit } from "@/app/app/projects/[id]/hindrances/_components/hindrance-pages";
import { HindranceFormSkeleton } from "@/app/app/_components/site-work/site-work-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit hindrance" };

export default async function HindranceEditRoute({
  params,
}: {
  params: Promise<{ id: string; hindranceId: string }>;
}) {
  const { id, hindranceId } = await params;
  if (!(await viewerCan("site_work.hindrances", "update", { projectId: id })))
    return <ProjectNoAccess what="editing hindrances" />;
  return (
    <QuerySuspense fallback={<HindranceFormSkeleton projectId={id} />}>
      <HindranceEdit projectId={id} hindranceId={hindranceId} />
    </QuerySuspense>
  );
}
