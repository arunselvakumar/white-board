import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { HindranceEdit } from "@/components/site-work/hindrances/hindrance-pages";
import { HindranceFormSkeleton } from "@/components/site-work/site-work-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit hindrance" };

/** Edit a hindrance (CM-607). */
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
