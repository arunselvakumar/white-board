import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { IssueEdit } from "@/components/tracking/issues/issue-pages";

export const metadata: Metadata = { title: "Edit issue" };

/** Edit an open Issue & Snag (CM-803). */
export default async function IssueEditPage({
  params,
}: {
  params: Promise<{ id: string; issueId: string }>;
}) {
  const { id, issueId } = await params;
  if (!(await viewerCan("tracking.issues", "update", { projectId: id })))
    return <ProjectNoAccess what="editing issues" />;
  return <IssueEdit projectId={id} issueId={issueId} />;
}
