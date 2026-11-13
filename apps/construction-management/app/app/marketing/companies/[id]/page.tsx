import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { GET as getCompany } from "@/app/api/construction/marketing/companies/[id]/route";
import {
  companyQuery,
  MARKETING_COMPANIES_API,
} from "@/src/queries/marketing-companies";
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
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("marketing.companies", "read")))
    return <MarketingNoAccess what="Prospect Companies" />;

  const queryClient = getQueryClient();
  try {
    await prefetchRoute(queryClient, companyQuery(id), ROUTES);
  } catch (error) {
    if (isCompanyNotFound(error)) return <CompanyNotFound />;
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CompanyDetail id={id} />
    </HydrationBoundary>
  );
}
