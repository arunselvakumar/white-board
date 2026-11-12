import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerFlags } from "@/app/app/_lib/viewer-can";
import { GET as formOptions } from "@/app/api/construction/marketing/visits/form-options/route";
import { GET as listVisits } from "@/app/api/construction/marketing/visits/route";
import {
  MARKETING_VISITS_API,
  visitFormOptionsQuery,
  visitsQuery,
} from "@/src/queries/marketing-visits";
import { getQueryClient } from "@/src/queries/query-client";
import {
  prefetchInfiniteRoute,
  prefetchRoute,
} from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../_components/marketing-no-access";
import { VisitsList } from "./_components/visits-list";

export const metadata: Metadata = { title: "Visits" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [MARKETING_VISITS_API]: listVisits,
  [`${MARKETING_VISITS_API}/form-options`]: formOptions,
};

/** Visits, unfiltered on arrival (ADR-0052). */
export default async function Page() {
  const can = await viewerFlags("marketing.visits", ["read", "create"]);
  if (!can.read) return <MarketingNoAccess what="Visits" />;

  const queryClient = getQueryClient();
  await Promise.all([
    prefetchInfiniteRoute(queryClient, visitsQuery(), ROUTES),
    prefetchRoute(queryClient, visitFormOptionsQuery, ROUTES),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <VisitsList canCreate={can.create} />
    </HydrationBoundary>
  );
}
