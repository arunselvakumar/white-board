import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { GalleryPage } from "@/components/projects/gallery/gallery-page";

export const metadata: Metadata = { title: "Gallery" };

/**
 * The Project's Gallery (CM-410). Read only: the API lists just the files
 * whose source the Team Member may read, so the page needs only the
 * Gallery's own Read flag.
 */
export default async function ProjectGalleryRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("projects.gallery", "read")))
    return <ProjectNoAccess what="the Gallery" />;
  return <GalleryPage projectId={id} />;
}
