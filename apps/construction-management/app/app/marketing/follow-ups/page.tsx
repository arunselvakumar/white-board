import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan, viewerFlags } from "@/app/app/_lib/viewer-can";
import { GET as formOptions } from "@/app/api/construction/marketing/follow-ups/form-options/route";
import { GET as listFollowUps } from "@/app/api/construction/marketing/follow-ups/route";
import {
  followUpFormOptionsQuery,
  followUpsArrivalFilters,
  followUpsQuery,
  MARKETING_FOLLOW_UPS_API,
} from "@/src/queries/marketing-follow-ups";
import { getQueryClient } from "@/src/queries/query-client";
import {
  prefetchInfiniteRoute,
  prefetchRoute,
} from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../_components/marketing-no-access";
import { FollowUpsList } from "./_components/follow-ups-list";

export const metadata: Metadata = { title: "Follow-ups" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [MARKETING_FOLLOW_UPS_API]: listFollowUps,
  [`${MARKETING_FOLLOW_UPS_API}/form-options`]: formOptions,
};

/**
 * The viewer's own Open Follow-ups on arrival (ADR-0052), or with
 * `?owner=` and View all, everyone's of that owner.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string | string[] }>;
}) {
  const can = await viewerFlags("marketing.follow_ups", ["read", "create"]);
  if (!can.read) return <MarketingNoAccess what="Follow-ups" />;
  const canLogVisit = await viewerCan("marketing.visits", "create");

  const { owner: raw } = await searchParams;
  const owner = typeof raw === "string" ? raw : undefined;

  const queryClient = getQueryClient();
  const options = await prefetchRoute(
    queryClient,
    followUpFormOptionsQuery,
    ROUTES,
  );
  await prefetchInfiniteRoute(
    queryClient,
    followUpsQuery(followUpsArrivalFilters(owner, options.canSeeAll)),
    ROUTES,
  );

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <FollowUpsList
        canCreate={can.create}
        canLogVisit={canLogVisit}
        owner={owner}
      />
    </HydrationBoundary>
  );
}
