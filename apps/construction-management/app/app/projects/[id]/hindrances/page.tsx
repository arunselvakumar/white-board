import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { HindrancesList } from "@/components/site-work/hindrances/hindrances-list";
import { HindrancesPageSkeleton } from "@/components/site-work/site-work-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Hindrances" };

/** The Project's Hindrance register (CM-607). */
export default async function HindrancesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("site_work.hindrances", "read", { projectId: id })))
    return <ProjectNoAccess what="the Hindrance register" />;
  return (
    <QuerySuspense fallback={<HindrancesPageSkeleton />}>
      <HindrancesList projectId={id} />
    </QuerySuspense>
  );
}
