import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { GET as getCompany } from "@/app/api/construction/marketing/companies/[id]/route";
import { GET as companyFormOptions } from "@/app/api/construction/marketing/companies/form-options/route";
import { GET as followUpFormOptions } from "@/app/api/construction/marketing/follow-ups/form-options/route";
import {
  companyFormOptionsQuery,
  companyQuery,
  MARKETING_COMPANIES_API,
} from "@/src/queries/marketing-companies";
import {
  followUpFormOptionsQuery,
  MARKETING_FOLLOW_UPS_API,
} from "@/src/queries/marketing-follow-ups";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute, routeHandler } from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../../_components/marketing-no-access";
import { CompanyDetail } from "../_components/company-detail";
import {
  CompanyNotFound,
  isCompanyNotFound,
} from "../_components/company-not-found";

export const metadata: Metadata = { title: "Prospect Company" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

const ROUTES = {
  [`${MARKETING_COMPANIES_API}/[id]`]: routeHandler(getCompany),
  [`${MARKETING_COMPANIES_API}/form-options`]: companyFormOptions,
  [`${MARKETING_FOLLOW_UPS_API}/form-options`]: followUpFormOptions,
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("marketing.companies", "read")))
    return <MarketingNoAccess what="Prospect Companies" />;

  const canPlanVisit = await viewerCan("marketing.visits", "create");
  const canAddFollowUp = await viewerCan("marketing.follow_ups", "create");
  const canReassign = await viewerCan("marketing.companies", "transfer");

  const queryClient = getQueryClient();
  try {
    await Promise.all([
      prefetchRoute(queryClient, companyQuery(id), ROUTES),
      // What Add Follow-up's form reads.
      canAddFollowUp
        ? prefetchRoute(queryClient, followUpFormOptionsQuery, ROUTES).catch(
            () => undefined,
          )
        : undefined,
      // The people Reassign offers.
      canReassign
        ? prefetchRoute(queryClient, companyFormOptionsQuery, ROUTES).catch(
            () => undefined,
          )
        : undefined,
    ]);
  } catch (error) {
    if (isCompanyNotFound(error)) return <CompanyNotFound />;
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CompanyDetail
        id={id}
        canPlanVisit={canPlanVisit}
        canAddFollowUp={canAddFollowUp}
      />
    </HydrationBoundary>
  );
}
