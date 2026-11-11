import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import {
  loadProjectActivitySearch,
  projectActivityFilter,
} from "@/app/app/_components/activity/activity-search-params";
import { ProjectActivityPage } from "@/app/app/projects/[id]/activity/_components/project-activity-page";
import { GET as getActivity } from "@/app/api/construction/projects/projects/[id]/activity/route";
import { projectActivityQuery } from "@/src/queries/activity";
import { PROJECTS_API } from "@/src/queries/projects";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchInfiniteRoute, routeHandler } from "@/src/queries/route-fetch";

export const metadata: Metadata = { title: "Activity" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [`${PROJECTS_API}/[id]/activity`]: routeHandler(getActivity),
};

/**
 * Project → Activity (ADR CM-0038 §4). Prefetches the feed's first page,
 * filtered as the address says (ADR-0052); the layout prefetches the shell's.
 */
export default async function ProjectActivityRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, search] = await Promise.all([
    params,
    loadProjectActivitySearch(searchParams),
  ]);
  const queryClient = getQueryClient();
  await Promise.all([
    prefetchInfiniteRoute(
      queryClient,
      projectActivityQuery(id, projectActivityFilter(search)),
      ROUTES,
    ),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectActivityPage projectId={id} />
    </HydrationBoundary>
  );
}
