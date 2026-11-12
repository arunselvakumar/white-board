import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { GET as getCompany } from "@/app/api/construction/marketing/companies/[id]/route";
import { GET as formOptions } from "@/app/api/construction/marketing/companies/form-options/route";
import {
  companyFormOptionsQuery,
  companyQuery,
  MARKETING_COMPANIES_API,
} from "@/src/queries/marketing-companies";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute, routeHandler } from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../../../_components/marketing-no-access";
import {
  CompanyNotFound,
  isCompanyNotFound,
} from "../../_components/company-not-found";
import { CompanyEdit } from "../../_components/company-pages";

export const metadata: Metadata = { title: "Edit Prospect Company" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

// form-options first: its path also matches the `[id]` pattern.
const ROUTES = {
  [`${MARKETING_COMPANIES_API}/form-options`]: formOptions,
  [`${MARKETING_COMPANIES_API}/[id]`]: routeHandler(getCompany),
};

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("marketing.companies", "update")))
    return <MarketingNoAccess what="editing Prospect Companies" />;

  const queryClient = getQueryClient();
  try {
    await Promise.all([
      prefetchRoute(queryClient, companyQuery(id), ROUTES),
      prefetchRoute(queryClient, companyFormOptionsQuery, ROUTES),
    ]);
  } catch (error) {
    if (isCompanyNotFound(error)) return <CompanyNotFound />;
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CompanyEdit id={id} />
    </HydrationBoundary>
  );
}
