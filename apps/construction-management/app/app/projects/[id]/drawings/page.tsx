import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { DrawingsPage } from "@/components/projects/drawings/drawings-page";
import { QuerySuspense } from "@/components/query-suspense";
import { DrawingsSkeleton } from "@/components/projects/drawings/drawings-skeletons";

export const metadata: Metadata = { title: "Drawings" };

/** The Project's Drawings: its albums (CM-408). */
export default async function ProjectDrawingsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("projects.drawings", "read")))
    return <ProjectNoAccess what="Drawings" />;
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    viewerCan("projects.drawings", "create", { projectId: id }),
    viewerCan("projects.drawings", "update", { projectId: id }),
    viewerCan("projects.drawings", "delete", { projectId: id }),
  ]);
  return (
    <QuerySuspense fallback={<DrawingsSkeleton />}>
      <DrawingsPage
        projectId={id}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </QuerySuspense>
  );
}
