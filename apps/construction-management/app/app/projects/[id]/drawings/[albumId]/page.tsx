import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { DrawingAlbumPage } from "@/components/projects/drawings/drawing-album-page";

export const metadata: Metadata = { title: "Drawings" };

/** One album of the Project's Drawings (CM-408). */
export default async function ProjectDrawingAlbumRoute({
  params,
}: {
  params: Promise<{ id: string; albumId: string }>;
}) {
  const { id, albumId } = await params;
  if (!(await viewerCan("projects.drawings", "read")))
    return <ProjectNoAccess what="Drawings" />;
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    viewerCan("projects.drawings", "create", { projectId: id }),
    viewerCan("projects.drawings", "update", { projectId: id }),
    viewerCan("projects.drawings", "delete", { projectId: id }),
  ]);
  return (
    <DrawingAlbumPage
      projectId={id}
      albumId={albumId}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
    />
  );
}
