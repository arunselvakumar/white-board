import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { IssuesList } from "@/components/tracking/issues/issues-list";

export const metadata: Metadata = { title: "Issues & Snags" };

/** The Project's Issues & Snags (CM-803). */
export default async function IssuesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("tracking.issues", "read", { projectId: id })))
    return <ProjectNoAccess what="Issues & Snags" />;
  return <IssuesList projectId={id} />;
}
