import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerFlags } from "@/app/app/_lib/viewer-can";
import { GET as getVisit } from "@/app/api/construction/marketing/visits/[id]/route";
import { GET as formOptions } from "@/app/api/construction/marketing/visits/form-options/route";
import {
  MARKETING_VISITS_API,
  visitFormOptionsQuery,
  visitQuery,
} from "@/src/queries/marketing-visits";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute, routeHandler } from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../../../_components/marketing-no-access";
import { VisitComplete } from "../../_components/visit-form-pages";
import {
  isVisitNotFound,
  VisitNotFound,
} from "../../_components/visit-not-found";

export const metadata: Metadata = { title: "Complete Visit" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

// form-options first: its path also matches the `[id]` pattern.
const ROUTES = {
  [`${MARKETING_VISITS_API}/form-options`]: formOptions,
  [`${MARKETING_VISITS_API}/[id]`]: routeHandler(getVisit),
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // A write needs Visits read too: the routes answer 403 without it.
  const flags = await viewerFlags("marketing.visits", ["read", "update"]);
  if (!flags.read || !flags.update)
    return <MarketingNoAccess what="completing Visits" />;
  const canAddFollowUp = await viewerCan("marketing.follow_ups", "create");

  const queryClient = getQueryClient();
  try {
    await Promise.all([
      prefetchRoute(queryClient, visitQuery(id), ROUTES),
      prefetchRoute(queryClient, visitFormOptionsQuery, ROUTES),
    ]);
  } catch (error) {
    if (isVisitNotFound(error)) return <VisitNotFound />;
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <VisitComplete id={id} canAddFollowUp={canAddFollowUp} />
    </HydrationBoundary>
  );
}
