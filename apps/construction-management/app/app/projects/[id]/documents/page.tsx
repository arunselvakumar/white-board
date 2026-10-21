import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectDocumentsPage } from "@/components/projects/documents/project-documents-page";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectDocumentsSkeleton } from "@/components/projects/documents/documents-skeletons";

export const metadata: Metadata = { title: "Documents" };

/** The Project's Documents tab (CM-414). */
export default async function ProjectDocumentsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canEdit = await viewerCan("projects.project", "update", {
    projectId: id,
  });
  return (
    <QuerySuspense fallback={<ProjectDocumentsSkeleton />}>
      <ProjectDocumentsPage projectId={id} canEdit={canEdit} />
    </QuerySuspense>
  );
}
