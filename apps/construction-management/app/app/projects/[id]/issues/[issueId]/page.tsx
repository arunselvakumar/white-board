import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { IssueDetail } from "@/components/tracking/issues/issue-detail";

export const metadata: Metadata = { title: "Issue" };

/** One Issue & Snag (CM-803). */
export default async function IssuePage({
  params,
}: {
  params: Promise<{ id: string; issueId: string }>;
}) {
  const { id, issueId } = await params;
  if (!(await viewerCan("tracking.issues", "read", { projectId: id })))
    return <ProjectNoAccess what="Issues & Snags" />;
  return <IssueDetail projectId={id} id={issueId} />;
}
