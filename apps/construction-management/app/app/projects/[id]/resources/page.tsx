import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectResourcesPage } from "@/app/app/projects/[id]/resources/_components/project-resources-page";
import { RESOURCES_STEP } from "@/app/app/projects/_components/resources/resources-step";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectResourcesSkeleton } from "@/app/app/projects/[id]/resources/_components/resources-skeletons";

export const metadata: Metadata = { title: "Resources" };

/**
 * The Project's Resources; `?step=resources` right after Add Project shows
 * it as the wizard's second step.
 */
export default async function ProjectResourcesRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const [{ id }, { step }] = await Promise.all([params, searchParams]);
  const canEdit = await viewerCan("projects.project", "update", {
    projectId: id,
  });
  return (
    <QuerySuspense fallback={<ProjectResourcesSkeleton />}>
      <ProjectResourcesPage
        projectId={id}
        canEdit={canEdit}
        wizard={step === RESOURCES_STEP}
      />
    </QuerySuspense>
  );
}
