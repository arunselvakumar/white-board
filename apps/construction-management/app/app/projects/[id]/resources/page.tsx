import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectResourcesPage } from "@/app/app/projects/[id]/resources/_components/project-resources-page";
import { RESOURCES_STEP } from "@/app/app/projects/_components/resources/resources-step";
import { GET as listProjectLabours } from "@/app/api/construction/projects/projects/[id]/resources/labours/route";
import { GET as readResources } from "@/app/api/construction/projects/projects/[id]/resources/route";
import {
  PROJECT_LABOURS_API,
  RESOURCES_API,
  projectLaboursQuery,
  projectResourcesQuery,
} from "@/src/queries/project-resources";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute, routeHandler } from "@/src/queries/route-fetch";

export const metadata: Metadata = { title: "Resources" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

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
  const queryClient = getQueryClient();
  const routes = {
    [RESOURCES_API]: routeHandler(readResources),
    [PROJECT_LABOURS_API]: routeHandler(listProjectLabours),
  };
  const [canEdit, canReadLabours, canTransfer] = await Promise.all([
    viewerCan("projects.project", "update", { projectId: id }),
    viewerCan("masters.labours", "read"),
    viewerCan("labour.labour", "transfer", { projectId: id }),
    prefetchRoute(queryClient, projectResourcesQuery(id), routes),
    prefetchRoute(queryClient, projectLaboursQuery(id), routes),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectResourcesPage
        projectId={id}
        canEdit={canEdit}
        canReadLabours={canReadLabours}
        canTransfer={canTransfer}
        wizard={step === RESOURCES_STEP}
      />
    </HydrationBoundary>
  );
}
