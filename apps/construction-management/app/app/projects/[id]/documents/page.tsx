import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectDocumentsPage } from "@/app/app/projects/[id]/documents/_components/project-documents-page";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectDocumentsSkeleton } from "@/app/app/projects/[id]/documents/_components/documents-skeletons";

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
