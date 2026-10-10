import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectAmenities } from "@/components/projects/project-amenities";

export const metadata: Metadata = { title: "Amenities" };

/** The Project's Amenities and Common Developments (CM-404). */
export default async function ProjectAmenitiesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canEdit = await viewerCan("projects.project", "update", {
    projectId: id,
  });
  return <ProjectAmenities projectId={id} canEdit={canEdit} />;
}
