import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProjectsHome } from "@/app/app/projects/_components/projects-home";
import { GET as listProjects } from "@/app/api/construction/projects/projects/route";
import { APP_HOME } from "@/lib/safe-redirect";
import { PROJECTS_API, projectsQuery } from "@/src/queries/projects";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute } from "@/src/queries/route-fetch";

import { viewerHomePath } from "../_lib/viewer-home";

export const metadata: Metadata = { title: "Projects" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

/** The Projects home; an HRMS Team Member has no Projects and lands in HRMS. */
export default async function ProjectsPage() {
  const home = await viewerHomePath();
  if (home !== APP_HOME) redirect(home);

  const queryClient = getQueryClient();
  await prefetchRoute(queryClient, projectsQuery, {
    [PROJECTS_API]: listProjects,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectsHome />
    </HydrationBoundary>
  );
}
