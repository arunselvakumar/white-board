import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
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
import { VisitEdit } from "../../_components/visit-form-pages";
import {
  isVisitNotFound,
  VisitNotFound,
} from "../../_components/visit-not-found";

export const metadata: Metadata = { title: "Edit Visit" };

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
  if (!(await viewerCan("marketing.visits", "update")))
    return <MarketingNoAccess what="editing Visits" />;

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
      <VisitEdit id={id} />
    </HydrationBoundary>
  );
}
