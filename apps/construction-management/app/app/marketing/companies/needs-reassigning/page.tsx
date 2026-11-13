import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan, viewerFlags } from "@/app/app/_lib/viewer-can";
import { GET as formOptions } from "@/app/api/construction/marketing/companies/form-options/route";
import { GET as needsReassigning } from "@/app/api/construction/marketing/companies/needs-reassigning/route";
import { GET as followUpFormOptions } from "@/app/api/construction/marketing/follow-ups/form-options/route";
import {
  companyFormOptionsQuery,
  MARKETING_COMPANIES_API,
} from "@/src/queries/marketing-companies";
import {
  followUpFormOptionsQuery,
  MARKETING_FOLLOW_UPS_API,
} from "@/src/queries/marketing-follow-ups";
import {
  NEEDS_REASSIGNING_API,
  needsReassigningQuery,
} from "@/src/queries/marketing-team";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute } from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../../_components/marketing-no-access";
import { NeedsReassigningPage } from "./_components/needs-reassigning-page";

export const metadata: Metadata = { title: "Needs reassigning" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [NEEDS_REASSIGNING_API]: needsReassigning,
  [`${MARKETING_COMPANIES_API}/form-options`]: formOptions,
  [`${MARKETING_FOLLOW_UPS_API}/form-options`]: followUpFormOptions,
};

/** For Companies transfer (ADR-0052). */
export default async function Page() {
  const can = await viewerFlags("marketing.companies", ["read", "transfer"]);
  if (!can.read || !can.transfer)
    return <MarketingNoAccess what="reassigning Prospect Companies" />;
  const canChangeOwner = await viewerCan("marketing.follow_ups", "update");

  const queryClient = getQueryClient();
  await Promise.all([
    prefetchRoute(queryClient, needsReassigningQuery, ROUTES),
    // The people Reassign offers.
    prefetchRoute(queryClient, companyFormOptionsQuery, ROUTES),
    // The people a Follow-up's Edit dialog offers.
    canChangeOwner
      ? prefetchRoute(queryClient, followUpFormOptionsQuery, ROUTES).catch(
          () => undefined,
        )
      : undefined,
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <NeedsReassigningPage canChangeOwner={canChangeOwner} />
    </HydrationBoundary>
  );
}
