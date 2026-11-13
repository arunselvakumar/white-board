import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { GET as getVisit } from "@/app/api/construction/marketing/visits/[id]/route";
import {
  MARKETING_VISITS_API,
  visitQuery,
} from "@/src/queries/marketing-visits";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute, routeHandler } from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../../_components/marketing-no-access";
import { VisitDetail } from "../_components/visit-detail";
import { isVisitNotFound, VisitNotFound } from "../_components/visit-not-found";

export const metadata: Metadata = { title: "Visit" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [`${MARKETING_VISITS_API}/[id]`]: routeHandler(getVisit),
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("marketing.visits", "read")))
    return <MarketingNoAccess what="Visits" />;

  const queryClient = getQueryClient();
  try {
    await prefetchRoute(queryClient, visitQuery(id), ROUTES);
  } catch (error) {
    if (isVisitNotFound(error)) return <VisitNotFound />;
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <VisitDetail id={id} />
    </HydrationBoundary>
  );
}
