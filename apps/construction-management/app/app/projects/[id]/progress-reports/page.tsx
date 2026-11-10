import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { ProgressReportsPage } from "@/app/app/projects/[id]/progress-reports/_components/progress-reports-page";
import { ProgressReportsPageSkeleton } from "@/app/app/_components/site-work/site-work-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Progress Reports" };

/** The Project's Progress Reports: Daily Progress Reports. */
export default async function ProgressReportsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("site_work.progress_reports", "read", { projectId: id }))
  )
    return <ProjectNoAccess what="Progress Reports" />;
  return (
    <QuerySuspense fallback={<ProgressReportsPageSkeleton />}>
      <ProgressReportsPage projectId={id} />
    </QuerySuspense>
  );
}
