import { dehydrate } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { ProjectHydrationBoundary } from "@/app/app/projects/[id]/_components/project-hydration-boundary";
import { ProjectShell } from "@/app/app/projects/[id]/_components/project-shell";
import { GET as getHome } from "@/app/api/construction/projects/projects/[id]/home/route";
import { GET as getProject } from "@/app/api/construction/projects/projects/[id]/route";
import { projectHomeQuery } from "@/src/queries/project-home";
import { PROJECTS_API, projectQuery } from "@/src/queries/projects";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute, routeHandler } from "@/src/queries/route-fetch";

const ROUTES = {
  [`${PROJECTS_API}/[id]`]: routeHandler(getProject),
  [`${PROJECTS_API}/[id]/home`]: routeHandler(getHome),
};

/**
 * The project shell around every Project page. It prefetches the Project
 * and its home, which the shell reads, so a page that renders on the server
 * renders its header there too (ADR-0052); a page's own prefetch sits below
 * the shell and cannot reach it. A read that fails (a Project the member is
 * not on) is left to the shell in the browser, which shows its own state.
 */
export default async function ProjectLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;
  const queryClient = getQueryClient();
  await Promise.all([
    prefetchRoute(queryClient, projectQuery(id), ROUTES).catch(() => null),
    prefetchRoute(queryClient, projectHomeQuery(id), ROUTES).catch(() => null),
  ]);
  return (
    <ProjectHydrationBoundary state={dehydrate(queryClient)}>
      <ProjectShell id={id}>{children}</ProjectShell>
    </ProjectHydrationBoundary>
  );
}
