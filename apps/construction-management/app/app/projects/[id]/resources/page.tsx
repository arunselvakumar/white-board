import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectResourcesPage } from "@/components/projects/resources/project-resources-page";
import { RESOURCES_STEP } from "@/components/projects/resources/resources-step";

export const metadata: Metadata = { title: "Resources" };

/**
 * The Project's Resources (CM-406); `?step=resources` right after Add
 * Project shows it as the wizard's second step.
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
    <ProjectResourcesPage
      projectId={id}
      canEdit={canEdit}
      wizard={step === RESOURCES_STEP}
    />
  );
}
