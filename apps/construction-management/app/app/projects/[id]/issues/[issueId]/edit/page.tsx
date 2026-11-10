import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { IssueEdit } from "@/app/app/projects/[id]/issues/_components/issue-pages";
import { TrackingFormSkeleton } from "@/app/app/projects/[id]/_components/tracking/tracking-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit issue" };

/** Edit an open Issue & Snag. */
export default async function IssueEditPage({
  params,
}: {
  params: Promise<{ id: string; issueId: string }>;
}) {
  const { id, issueId } = await params;
  if (!(await viewerCan("tracking.issues", "update", { projectId: id })))
    return <ProjectNoAccess what="editing issues" />;
  return (
    <QuerySuspense
      fallback={<TrackingFormSkeleton kind="issue" projectId={id} />}
    >
      <IssueEdit projectId={id} issueId={issueId} />
    </QuerySuspense>
  );
}
