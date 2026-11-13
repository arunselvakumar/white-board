import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan, viewerFlags } from "@/app/app/_lib/viewer-can";
import { GET as followUpFormOptions } from "@/app/api/construction/marketing/follow-ups/form-options/route";
import { GET as listFollowUps } from "@/app/api/construction/marketing/follow-ups/route";
import { GET as getVisit } from "@/app/api/construction/marketing/visits/[id]/route";
import {
  followUpFormOptionsQuery,
  followUpsQuery,
  MARKETING_FOLLOW_UPS_API,
} from "@/src/queries/marketing-follow-ups";
import {
  MARKETING_VISITS_API,
  visitQuery,
} from "@/src/queries/marketing-visits";
import { getQueryClient } from "@/src/queries/query-client";
import {
  prefetchInfiniteRoute,
  prefetchRoute,
  routeHandler,
} from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../../_components/marketing-no-access";
import { VisitDetail } from "../_components/visit-detail";
import { isVisitNotFound, VisitNotFound } from "../_components/visit-not-found";

export const metadata: Metadata = { title: "Visit" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [`${MARKETING_VISITS_API}/[id]`]: routeHandler(getVisit),
  [MARKETING_FOLLOW_UPS_API]: listFollowUps,
  [`${MARKETING_FOLLOW_UPS_API}/form-options`]: followUpFormOptions,
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("marketing.visits", "read")))
    return <MarketingNoAccess what="Visits" />;
  const followUps = await viewerFlags("marketing.follow_ups", [
    "read",
    "create",
  ]);
  const canLogVisit = await viewerCan("marketing.visits", "create");

  const queryClient = getQueryClient();
  try {
    await Promise.all([
      prefetchRoute(queryClient, visitQuery(id), ROUTES),
      // Its Follow-ups card, and the options Add Follow-up reads.
      followUps.read
        ? prefetchInfiniteRoute(
            queryClient,
            followUpsQuery({ visitId: id }),
            ROUTES,
          ).catch(() => undefined)
        : undefined,
      followUps.create
        ? prefetchRoute(queryClient, followUpFormOptionsQuery, ROUTES).catch(
            () => undefined,
          )
        : undefined,
    ]);
  } catch (error) {
    if (isVisitNotFound(error)) return <VisitNotFound />;
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <VisitDetail
        id={id}
        followUps={
          followUps.read
            ? { create: followUps.create, logVisit: canLogVisit }
            : null
        }
      />
    </HydrationBoundary>
  );
}
