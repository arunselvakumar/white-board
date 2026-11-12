import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { GET as formOptions } from "@/app/api/construction/marketing/companies/form-options/route";
import {
  companyFormOptionsQuery,
  MARKETING_COMPANIES_API,
} from "@/src/queries/marketing-companies";
import { getQueryClient } from "@/src/queries/query-client";
import { prefetchRoute } from "@/src/queries/route-fetch";

import { MarketingNoAccess } from "../../_components/marketing-no-access";
import { CompanyNew } from "../_components/company-pages";

export const metadata: Metadata = { title: "Add Prospect Company" };

// The prefetch reads the request's Session cookie.
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!(await viewerCan("marketing.companies", "create")))
    return <MarketingNoAccess what="adding Prospect Companies" />;

  const queryClient = getQueryClient();
  await prefetchRoute(queryClient, companyFormOptionsQuery, {
    [`${MARKETING_COMPANIES_API}/form-options`]: formOptions,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CompanyNew />
    </HydrationBoundary>
  );
}
