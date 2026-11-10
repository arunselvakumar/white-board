import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectAmenities } from "@/app/app/projects/_components/project-amenities";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectAmenitiesSkeleton } from "@/app/app/projects/_components/projects-skeletons";

export const metadata: Metadata = { title: "Amenities" };

export default async function ProjectAmenitiesRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canEdit = await viewerCan("projects.project", "update", {
    projectId: id,
  });
  return (
    <QuerySuspense fallback={<ProjectAmenitiesSkeleton />}>
      <ProjectAmenities projectId={id} canEdit={canEdit} />
    </QuerySuspense>
  );
}
