import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { IssueNew } from "@/components/tracking/issues/issue-pages";
import { TrackingFormSkeleton } from "@/components/tracking/tracking-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Add Issue" };

/** Add an Issue & Snag (CM-803). */
export default async function IssueNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("tracking.issues", "create", { projectId: id })))
    return <ProjectNoAccess what="adding issues" />;
  return (
    <QuerySuspense
      fallback={
        <TrackingFormSkeleton kind="issue" projectId={id} title="Add Issue" />
      }
    >
      <IssueNew projectId={id} />
    </QuerySuspense>
  );
}
